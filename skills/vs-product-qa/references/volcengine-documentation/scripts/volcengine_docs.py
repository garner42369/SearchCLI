#!/usr/bin/env python3
import sys
import json
import requests
from urllib.parse import urlparse

API_BASE = "https://docs-api.cn-beijing.volces.com/api/v1/doc"
REQUEST_TIMEOUT = 15  # 15-second timeout to avoid hanging forever

# Negative keyword filtering has been removed; all queries are allowed by default

def search(query, limit=10, service_codes=None):
    """Search Volcengine official documentation."""
    url = f"{API_BASE}/search"
    payload = {
        "Query": query,
        "Limit": limit
    }
    if service_codes:
        payload["ServiceCodes"] = service_codes
    
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": f"Search request failed: {str(e)}"}

def fetch(doc_url):
    """Fetch full documentation content and strip query parameters automatically."""
    parsed = urlparse(doc_url)
    # Strip query parameters and fragments so the request always uses a clean page URL.
    clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    
    url = f"{API_BASE}/fetch"
    payload = {
        "Url": clean_url
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        result = response.json()
        # Always return the clean URL so callers can cite a stable page link.
        if "Result" in result:
            result["Result"]["CleanUrl"] = clean_url
        return result
    except Exception as e:
        return {"error": f"Fetch request failed: {str(e)}"}

def print_help():
    help_info = {
        "name": "volcengine-docs documentation helper",
        "usage": [
            {
                "action": "search",
                "desc": "Search Volcengine documentation",
                "params": "<query> [limit] [service_code_1,service_code_2...]",
                "example": 'python volcengine_docs.py search "what is Viking AI Search scene" 3 aisearch'
            },
            {
                "action": "fetch",
                "desc": "Fetch full page content from a Volcengine documentation URL",
                "params": "<volcengine_documentation_url>",
                "example": 'python volcengine_docs.py fetch "https://www.volcengine.com/docs/85296/1544972?lang=zh"'
            }
        ]
    }
    print(json.dumps(help_info, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print_help()
        sys.exit(1)
    
    action = sys.argv[1]
    result = {}
    
    if action == "search":
        if len(sys.argv) < 3:
            result = {"error": "Missing query", "help": "Usage: python volcengine_docs.py search <query> [limit] [service_code_1,service_code_2...]"}
        else:
            query = sys.argv[2]
            limit = 10
            service_codes = None
            if len(sys.argv) >=4:
                try:
                    limit = int(sys.argv[3])
                except ValueError:
                    result = {"error": "Limit must be a number"}
            if len(sys.argv) >=5:
                service_codes = sys.argv[4].split(",")
            
            if "error" not in result:
                result = search(query, limit, service_codes)
    
    elif action == "fetch":
        if len(sys.argv) < 3:
            result = {"error": "Missing document URL", "help": "Usage: python volcengine_docs.py fetch <volcengine_documentation_url>"}
        else:
            doc_url = sys.argv[2]
            result = fetch(doc_url)
    
    else:
        result = {"error": f"Unknown action: {action}", "help": "Supported actions: search, fetch"}
    
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if "error" in result:
        sys.exit(1)
