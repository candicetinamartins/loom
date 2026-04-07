#!/usr/bin/env python3
"""
Standalone Vector Memory Service for Loom Tier 2
Uses ChromaDB directly for vector storage and semantic search.
Does NOT require the external mempaplace package.
"""

import os
import sys
import json
import asyncio
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from dataclasses import dataclass, asdict

# FastAPI for HTTP service
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Vector database
import chromadb
from chromadb.config import Settings

# Configuration
LOOM_VECTOR_PORT = int(os.getenv("LOOM_VECTOR_PORT", "8765"))
LOOM_VECTOR_DATA = Path(os.getenv("LOOM_VECTOR_DATA", Path.home() / ".loom" / "vector_db"))

app = FastAPI(title="Loom Vector Memory Service", version="1.0.4")

# CORS for Electron frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global ChromaDB client
_chroma_client: Optional[chromadb.Client] = None

def get_chroma_client() -> chromadb.Client:
    """Get or initialize ChromaDB client"""
    global _chroma_client
    if _chroma_client is None:
        LOOM_VECTOR_DATA.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(
            path=str(LOOM_VECTOR_DATA),
            settings=Settings(anonymized_telemetry=False)
        )
    return _chroma_client


class MineRequest(BaseModel):
    """Request to index session events into Tier 2"""
    session_id: str
    agent_name: str
    task: str
    events: List[Dict[str, Any]]
    timestamp: Optional[str] = None


class SearchRequest(BaseModel):
    """Semantic search request"""
    query: str
    wing: Optional[str] = None  # Filter by agent
    room: Optional[str] = None   # Filter by session/task
    limit: int = 5
    threshold: float = 0.7


class MemoryEntry(BaseModel):
    """A memory stored in the vector DB"""
    id: str
    content: str
    agent: str
    session_id: str
    task: str
    event_kind: str
    timestamp: str
    metadata: Dict[str, Any]


class StatusResponse(BaseModel):
    """Service status"""
    status: str
    available: bool
    data_path: str
    collection_count: int
    memory_count: int


@app.on_event("startup")
async def startup():
    """Initialize ChromaDB on service start"""
    client = get_chroma_client()
    # Create collection if not exists
    try:
        client.get_collection("loom_memories")
        print(f"[VectorMemory] Connected to existing collection at {LOOM_VECTOR_DATA}")
    except ValueError:
        client.create_collection(
            name="loom_memories",
            metadata={"description": "Loom IDE agent session memories"}
        )
        print(f"[VectorMemory] Created new collection at {LOOM_VECTOR_DATA}")


@app.get("/status")
async def status():
    """Get service status and memory stats"""
    try:
        client = get_chroma_client()
        collection = client.get_collection("loom_memories")
        count = collection.count()
        return StatusResponse(
            status="healthy",
            available=True,
            data_path=str(LOOM_VECTOR_DATA),
            collection_count=1,
            memory_count=count
        )
    except Exception as e:
        return StatusResponse(
            status=f"error: {e}",
            available=False,
            data_path=str(LOOM_VECTOR_DATA),
            collection_count=0,
            memory_count=0
        )


@app.post("/mine")
async def mine(request: MineRequest):
    """Mine session events from Tier 1 into vector memory (Tier 2)"""
    client = get_chroma_client()
    collection = client.get_collection("loom_memories")
    
    documents = []
    metadatas = []
    ids = []
    
    for i, event in enumerate(request.events):
        content = format_event_for_vector(event)
        if not content:
            continue
        
        event_id = event.get("id", f"{i}")
        memory_id = f"{request.session_id}_{event_id}"
        
        documents.append(content)
        metadatas.append({
            "session_id": request.session_id,
            "agent": request.agent_name,
            "task": request.task,
            "event_kind": event.get("kind", "unknown"),
            "timestamp": event.get("ts", datetime.now().isoformat()),
            "event_id": event_id
        })
        ids.append(memory_id)
    
    if documents:
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
    
    return {
        "success": True,
        "session_id": request.session_id,
        "memories_added": len(documents),
        "agent": request.agent_name,
        "task": request.task
    }


@app.post("/search")
async def search(request: SearchRequest):
    """Semantic search across vector memories"""
    client = get_chroma_client()
    collection = client.get_collection("loom_memories")
    
    # Build where clause for filtering
    where_clause = {}
    if request.wing:
        where_clause["agent"] = request.wing
    if request.room:
        where_clause["session_id"] = request.room
    
    results = collection.query(
        query_texts=[request.query],
        n_results=request.limit,
        where=where_clause if where_clause else None
    )
    
    # Format response
    memories = []
    if results["ids"] and results["ids"][0]:
        for i, memory_id in enumerate(results["ids"][0]):
            memories.append({
                "id": memory_id,
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i] if results["distances"] else 0.0,
                "score": 1.0 - (results["distances"][0][i] if results["distances"] else 0.0)
            })
    
    return {"results": memories}


@app.post("/query")
async def query(request: SearchRequest):
    """Natural language query with formatted context for LLM"""
    search_results = await search(request)
    results = search_results.get("results", [])
    
    # Format as context string
    context_parts = []
    for r in results:
        meta = r["metadata"]
        agent = meta.get("agent", "unknown")
        task = meta.get("task", "")[:50]
        content = r["content"][:200]
        score = r.get("score", 0.0)
        
        context_parts.append(
            f"[{agent}] {task}...\n{content}... (relevance: {score:.2f})"
        )
    
    context = "\n\n".join(context_parts)
    
    return {
        "query": request.query,
        "memories_found": len(results),
        "context": f"[MEMORY]\n{context}" if context else "",
        "results": results
    }


def format_event_for_vector(event: Dict[str, Any]) -> Optional[str]:
    """Convert a Tier 1 session event to searchable text"""
    kind = event.get("kind", "unknown")
    payload = event.get("payload", {})
    
    if kind == "file_write":
        path = payload.get("path", "unknown")
        agent = payload.get("agentName", "agent")
        content_preview = payload.get("content", "")[:200]
        return f"File written by {agent}: {path}\nContent preview: {content_preview}"
    
    elif kind == "tool_call":
        tool = payload.get("tool", "unknown")
        args = json.dumps(payload.get("args", {}))
        result = str(payload.get("result", ""))[:100]
        return f"Tool {tool} called with {args}\nResult: {result}"
    
    elif kind == "bash_exec":
        cmd = payload.get("command", "")
        output = str(payload.get("output", ""))[:200]
        return f"Command: {cmd}\nOutput: {output}"
    
    elif kind == "agent_message":
        role = payload.get("role", "unknown")
        content = payload.get("content", "")[:500]
        return f"Agent message ({role}): {content}"
    
    elif kind == "agent_thought":
        thought = payload.get("thought", "")[:500]
        return f"Agent thought: {thought}"
    
    elif kind == "session_start":
        agent = payload.get("agentName", "unknown")
        task = payload.get("task", "")
        return f"Session started: {agent} working on {task}"
    
    elif kind == "session_end":
        promoted = payload.get("promoted", False)
        return f"Session ended. Memories promoted: {promoted}"
    
    elif kind == "file_read":
        path = payload.get("path", "unknown")
        return f"File read: {path}"
    
    elif kind == "checkpoint":
        checkpoint_id = payload.get("checkpointId", "unknown")
        return f"Checkpoint created: {checkpoint_id}"
    
    elif kind == "memory_approved":
        memory_key = payload.get("key", "unknown")
        return f"Memory approved: {memory_key}"
    
    return None


if __name__ == "__main__":
    print(f"[Loom Vector Memory] Starting on port {LOOM_VECTOR_PORT}")
    print(f"[Loom Vector Memory] Data directory: {LOOM_VECTOR_DATA}")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=LOOM_VECTOR_PORT,
        log_level="info"
    )
