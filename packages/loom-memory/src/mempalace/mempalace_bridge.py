#!/usr/bin/env python3
"""
MemPalace Bridge Service for Loom
Wraps mempaplace and exposes HTTP API for TypeScript integration.

Architecture:
- Runs as a subprocess from loom-electron backend
- Exposes FastAPI on localhost:8765 (configurable)
- ChromaDB stores vectors at ~/.mempalace/loom/
- Integrates with Loom's three-tier memory system as Tier 2

API Endpoints:
  POST /mine         - Index session events (Tier 1 → Tier 2 promotion)
  POST /search       - Semantic search across memories
  GET  /status       - Service health and stats
  POST /query        - Natural language query with context
"""

import os
import sys
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from dataclasses import dataclass

# FastAPI for HTTP service
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# MemPalace imports (will be available after pip install)
try:
    from mempalace import MemPalace, Wing, Room, Closet, Drawer
    from mempalace.miner import ProjectMiner, ConversationMiner
    MEMPALACE_AVAILABLE = True
except ImportError:
    MEMPALACE_AVAILABLE = False
    print("[WARN] mempalace not installed. Run: pip install mempalace")

# Configuration
LOOM_MEMPALACE_PORT = int(os.getenv("LOOM_MEMPALACE_PORT", "8765"))
LOOM_MEMPALACE_DATA = Path(os.getenv("LOOM_MEMPALACE_DATA", Path.home() / ".mempalace" / "loom"))

app = FastAPI(title="Loom MemPalace Bridge", version="1.0.0")

# CORS for Electron frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Electron local file access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global MemPalace instance
_mempalace: Optional[Any] = None


class MineRequest(BaseModel):
    """Request to index session events into Tier 2"""
    session_id: str
    agent_name: str
    task: str
    events: List[Dict[str, Any]]  # Session events from Tier 1
    timestamp: Optional[str] = None


class SearchRequest(BaseModel):
    """Semantic search request"""
    query: str
    wing: Optional[str] = None  # Filter by wing (agent, project)
    room: Optional[str] = None   # Filter by room (task type)
    limit: int = 5
    threshold: float = 0.7


class QueryResponse(BaseModel):
    """Search result from MemPalace"""
    id: str
    content: str
    wing: str
    room: str
    closet: Optional[str] = None
    score: float
    metadata: Dict[str, Any]
    timestamp: str


class StatusResponse(BaseModel):
    """Service status"""
    status: str
    mempalace_available: bool
    data_path: str
    wings_count: int
    rooms_count: int
    drawers_count: int


def get_mempalace() -> Any:
    """Get or initialize MemPalace instance"""
    global _mempalace
    if _mempalace is None and MEMPALACE_AVAILABLE:
        LOOM_MEMPALACE_DATA.mkdir(parents=True, exist_ok=True)
        _mempalace = MemPalace(path=LOOM_MEMPALACE_DATA)
    return _mempalace


@app.on_event("startup")
async def startup():
    """Initialize MemPalace on service start"""
    if not MEMPALACE_AVAILABLE:
        print("[ERROR] mempalace not installed. Tier 2 memory will be unavailable.")
        return
    
    palace = get_mempalace()
    if palace:
        # Create default Loom wing if not exists
        if "loom" not in palace.list_wings():
            palace.create_wing("loom", description="Loom IDE agent sessions and memories")
            palace.create_room("loom", "sessions", description="Agent session records")
            palace.create_room("loom", "decisions", description="Architecture and design decisions")
            palace.create_room("loom", "code", description="Code patterns and solutions")
        print(f"[MemPalace] Initialized at {LOOM_MEMPALACE_DATA}")


@app.get("/status", response_model=StatusResponse)
async def status():
    """Get service status and MemPalace stats"""
    palace = get_mempalace()
    
    if not MEMPALACE_AVAILABLE:
        return StatusResponse(
            status="error: mempalace not installed",
            mempalace_available=False,
            data_path=str(LOOM_MEMPALACE_DATA),
            wings_count=0,
            rooms_count=0,
            drawers_count=0
        )
    
    if palace is None:
        return StatusResponse(
            status="error: failed to initialize",
            mempalace_available=True,
            data_path=str(LOOM_MEMPALACE_DATA),
            wings_count=0,
            rooms_count=0,
            drawers_count=0
        )
    
    stats = palace.get_stats()
    return StatusResponse(
        status="healthy",
        mempalace_available=True,
        data_path=str(LOOM_MEMPALACE_DATA),
        wings_count=stats.get("wings", 0),
        rooms_count=stats.get("rooms", 0),
        drawers_count=stats.get("drawers", 0)
    )


@app.post("/mine")
async def mine(request: MineRequest, background_tasks: BackgroundTasks):
    """
    Mine session events from Tier 1 into MemPalace Tier 2.
    Called by MemoryIsolationService at session end.
    """
    palace = get_mempalace()
    if palace is None:
        raise HTTPException(503, "MemPalace not available")
    
    # Create wing for this agent if not exists
    wing_name = f"{request.agent_name.lower().replace(' ', '_')}"
    if wing_name not in palace.list_wings():
        palace.create_wing(
            wing_name,
            description=f"Memories from {request.agent_name} agent sessions"
        )
    
    # Create room for this specific task
    room_name = f"session_{request.session_id[:8]}"
    palace.create_room(wing_name, room_name, description=request.task)
    
    # Convert events to searchable content
    mined_count = 0
    for event in request.events:
        content = format_event_for_mempalace(event)
        if content:
            # Add to MemPalace as a drawer in the session room
            drawer_id = f"{request.session_id}_{event.get('id', mined_count)}"
            palace.add_drawer(
                wing=wing_name,
                room=room_name,
                closet="events",  # All session events go in events closet
                drawer_id=drawer_id,
                content=content,
                metadata={
                    "session_id": request.session_id,
                    "event_kind": event.get("kind"),
                    "timestamp": event.get("ts"),
                    "agent": request.agent_name
                }
            )
            mined_count += 1
    
    return {
        "success": True,
        "session_id": request.session_id,
        "drawers_added": mined_count,
        "wing": wing_name,
        "room": room_name
    }


@app.post("/search", response_model=List[QueryResponse])
async def search(request: SearchRequest):
    """
    Semantic search across MemPalace memories.
    Called by MemoryService for context retrieval.
    """
    palace = get_mempalace()
    if palace is None:
        raise HTTPException(503, "MemPalace not available")
    
    # Search using MemPalace's semantic search
    results = palace.search(
        query=request.query,
        wing=request.wing,
        room=request.room,
        limit=request.limit,
        threshold=request.threshold
    )
    
    # Convert to response format
    response = []
    for r in results:
        response.append(QueryResponse(
            id=r.get("id", ""),
            content=r.get("content", ""),
            wing=r.get("wing", ""),
            room=r.get("room", ""),
            closet=r.get("closet"),
            score=r.get("score", 0.0),
            metadata=r.get("metadata", {}),
            timestamp=r.get("timestamp", datetime.now().isoformat())
        ))
    
    return response


@app.post("/query")
async def query(request: SearchRequest):
    """
    Natural language query with full context.
    Returns relevant memories formatted for LLM context injection.
    """
    results = await search(request)
    
    # Format results as context string for LLM
    context_parts = []
    for r in results:
        context_parts.append(
            f"[{r.wing}/{r.room}] {r.content[:200]}... "
            f"(relevance: {r.score:.2f})"
        )
    
    return {
        "query": request.query,
        "memories_found": len(results),
        "context": "\n\n".join(context_parts),
        "results": [r.dict() for r in results]
    }


def format_event_for_mempalace(event: Dict[str, Any]) -> Optional[str]:
    """Convert a Tier 1 session event to searchable text for MemPalace"""
    kind = event.get("kind", "unknown")
    payload = event.get("payload", {})
    
    if kind == "file_write":
        path = payload.get("path", "unknown")
        agent = payload.get("agentName", "agent")
        return f"File written by {agent}: {path}"
    
    elif kind == "tool_call":
        tool = payload.get("tool", "unknown")
        args = payload.get("args", {})
        result = payload.get("result", "")[:100]  # Truncate
        return f"Tool {tool} executed: {json.dumps(args)} -> {result}"
    
    elif kind == "bash_exec":
        cmd = payload.get("command", "")
        output = payload.get("output", "")[:100]
        return f"Command executed: {cmd}\nOutput: {output}"
    
    elif kind == "agent_message":
        role = payload.get("role", "unknown")
        content = payload.get("content", "")[:200]
        return f"Agent {role}: {content}"
    
    elif kind == "session_start":
        agent = payload.get("agentName", "unknown")
        task = payload.get("task", "")
        return f"Session started: {agent} working on {task}"
    
    elif kind == "session_end":
        promoted = payload.get("promoted", False)
        return f"Session ended. Memories promoted: {promoted}"
    
    return None


if __name__ == "__main__":
    print(f"[Loom MemPalace Bridge] Starting on port {LOOM_MEMPALACE_PORT}")
    print(f"[Loom MemPalace Bridge] Data directory: {LOOM_MEMPALACE_DATA}")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=LOOM_MEMPALACE_PORT,
        log_level="info"
    )
