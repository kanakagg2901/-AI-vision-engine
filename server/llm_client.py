"""
Multi-Provider LLM Client for Privacy-Preserving Vision Agent Server.

Supports:
1. OpenRouter API (FREE models tier via OPENROUTER_API_KEY)
2. Google Gemini API (FREE via GEMINI_API_KEY / GOOGLE_API_KEY)
3. Anthropic Claude API (via ANTHROPIC_API_KEY)
4. Local Ollama LLM (100% Offline via OLLAMA_HOST, default http://localhost:11434)
5. Robust Demo Fallback Mode (Runs smoothly with ZERO API keys for hackathon demos!)
"""

import os
import json
import logging
import requests
from schemas import ScreenContext, AgentAction
from prompts import SYSTEM_PROMPT, format_screen_context

logger = logging.getLogger("agent-server")

def get_next_action(ctx: ScreenContext, history: list[dict]) -> AgentAction:
    """
    Evaluates sanitized screen context and returns the next AgentAction.
    Tries configured LLM providers in order, with automatic graceful fallback to Demo Mode.
    """
    user_content = format_screen_context(ctx)

    # 1. Try OpenRouter API if OPENROUTER_API_KEY is available
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        try:
            return _call_openrouter(openrouter_key, user_content, history)
        except Exception as e:
            logger.warning(f"OpenRouter API call failed: {e}. Trying fallback...")

    # 2. Try Google Gemini API if GEMINI_API_KEY / GOOGLE_API_KEY is available
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if gemini_key:
        try:
            return _call_gemini(gemini_key, user_content)
        except Exception as e:
            logger.warning(f"Gemini API call failed: {e}. Trying fallback...")

    # 3. Try Anthropic API if ANTHROPIC_API_KEY is available
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            return _call_anthropic(anthropic_key, user_content, history)
        except Exception as e:
            logger.warning(f"Anthropic API call failed: {e}. Trying fallback...")

    # 4. Try Local Ollama if available
    try:
        return _call_ollama(user_content)
    except Exception as e:
        logger.debug(f"Local Ollama not active: {e}")

    # 5. Guaranteed Hackathon Demo Fallback Mode (No API keys needed!)
    logger.info("Using smart on-device demo fallback mode for task execution.")
    return _smart_demo_fallback(ctx)


def _call_openrouter(api_key: str, user_content: str, history: list[dict]) -> AgentAction:
    headers = {
        "Authorization": f"Bearer {api_key.strip('\"')}",
        "Content-Type": "application/json"
    }
    prompt = f"{SYSTEM_PROMPT}\n\nRespond ONLY with valid JSON in format: {{\x22action\x22: \x22click\x22|\x22type\x22|\x22done\x22, \x22element_id\x22: \x22id\x22, \x22value_ref\x22: \x22val\x22, \x22reasoning\x22: \x22text\x22, \x22confidence\x22: 0.9}}\n\n{user_content}"
    
    body = {
        "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1
    }
    res = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body, timeout=10)
    res.raise_for_status()
    data = res.json()
    content = data["choices"][0]["message"]["content"]
    
    # Parse JSON from model output
    clean_json = content[content.find("{"):content.rfind("}")+1]
    parsed = json.loads(clean_json)
    return AgentAction(
        action=parsed.get("action", "click"),
        element_id=str(parsed.get("element_id")) if parsed.get("element_id") else None,
        value_ref=parsed.get("value_ref"),
        reasoning=parsed.get("reasoning", "OpenRouter AI reasoning step."),
        confidence=float(parsed.get("confidence", 0.9))
    )


def _call_gemini(api_key: str, user_content: str) -> AgentAction:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key.strip('\"')}"
    prompt = f"{SYSTEM_PROMPT}\n\nRespond ONLY with JSON: {{\x22action\x22: \x22click\x22|\x22type\x22|\x22done\x22, \x22element_id\x22: \x22id\x22, \x22value_ref\x22: \x22val\x22, \x22reasoning\x22: \x22text\x22, \x22confidence\x22: 0.9}}\n\n{user_content}"
    
    body = {"contents": [{"parts": [{"text": prompt}]}]}
    res = requests.post(url, json=body, timeout=10)
    res.raise_for_status()
    data = res.json()
    content = data["candidates"][0]["content"]["parts"][0]["text"]
    clean_json = content[content.find("{"):content.rfind("}")+1]
    parsed = json.loads(clean_json)
    return AgentAction(
        action=parsed.get("action", "click"),
        element_id=str(parsed.get("element_id")) if parsed.get("element_id") else None,
        value_ref=parsed.get("value_ref"),
        reasoning=parsed.get("reasoning", "Gemini VLM reasoning step."),
        confidence=float(parsed.get("confidence", 0.95))
    )


def _call_anthropic(api_key: str, user_content: str, history: list[dict]) -> AgentAction:
    from anthropic import Anthropic
    from prompts import ACTION_TOOL_SCHEMA
    client = Anthropic(api_key=api_key.strip('\"'))
    messages = history + [{"role": "user", "content": user_content}]
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=messages,
        tools=[ACTION_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "emit_action"},
    )
    tool_block = next(b for b in response.content if b.type == "tool_use")
    return AgentAction(**tool_block.input)


def _call_ollama(user_content: str) -> AgentAction:
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    url = f"{host}/api/generate"
    prompt = f"{SYSTEM_PROMPT}\n\nRespond ONLY with JSON: {{\x22action\x22: \x22click\x22, \x22element_id\x22: \x221\x22, \x22reasoning\x22: \x22text\x22, \x22confidence\x22: 0.9}}\n\n{user_content}"
    res = requests.post(url, json={"model": "qwen2.5:1.5b", "prompt": prompt, "stream": False}, timeout=5)
    res.raise_for_status()
    content = res.json().get("response", "")
    clean_json = content[content.find("{"):content.rfind("}")+1]
    parsed = json.loads(clean_json)
    return AgentAction(
        action=parsed.get("action", "click"),
        element_id=str(parsed.get("element_id")) if parsed.get("element_id") else None,
        value_ref=parsed.get("value_ref"),
        reasoning=parsed.get("reasoning", "Local Ollama LLM reasoning step."),
        confidence=0.85
    )


def _smart_demo_fallback(ctx: ScreenContext) -> AgentAction:
    """
    Intelligent Demo Mode fallback that selects the best target element
    from the sanitized scene graph when no API key is available or online servers are down.
    """
    if not ctx.elements:
        return AgentAction(
            action="done",
            reasoning="Task complete. No further interactive elements detected.",
            confidence=1.0
        )

    # Search for matching input field or action button
    task_lower = ctx.task.lower()
    
    # Priority 1: Search / Input fields if task involves searching or typing
    for el in ctx.elements:
        if el.role in ["input", "textarea"] or "search" in (el.label or "").lower():
            return AgentAction(
                action="type",
                element_id=el.element_id,
                value_ref="{{USER_SAVED_SEARCH_QUERY}}" if "search" in task_lower else "Sample Test Input",
                reasoning=f"Selected input element [{el.element_id}] for text entry.",
                confidence=0.9
            )

    # Priority 2: Primary action buttons (Submit, Search, Continue, Next)
    for el in ctx.elements:
        if el.role in ["button", "a"] or any(k in (el.label or "").lower() for k in ["submit", "search", "btn", "next", "go"]):
            return AgentAction(
                action="click",
                element_id=el.element_id,
                reasoning=f"Selected primary action target [{el.element_id}] ({el.label or 'button'}).",
                confidence=0.95
            )

    # Priority 3: Fallback to first available interactive element
    first_el = ctx.elements[0]
    return AgentAction(
        action="click",
        element_id=first_el.element_id,
        reasoning=f"Selected interactive element [{first_el.element_id}] from scene graph.",
        confidence=0.85
    )
