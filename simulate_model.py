"""
simulate_model.py
=================
Simulates a real ML/LLM model pushing live metrics to the Observability Platform.
AUTO-DISCOVERS available models — no need to hardcode an ID.

Run from the observability-platform directory:
    python simulate_model.py

Requirements: backend must be running on port 8000.
"""

import requests
import random
import time
import math
import sys

# Configure stdout to use UTF-8 to prevent charmap errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ── CONFIGURE ────────────────────────────────────────────────────────
BASE_URL = "http://localhost:8000"
API_KEY  = "obsv_al5iEyF3VKuUxa6Z79pKQXyOLZs_0gtDYVpC0UDAhqE"   # your API key
INTERVAL = 5   # seconds between pushes
# ─────────────────────────────────────────────────────────────────────

HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}


def fetch_models():
    """Fetch all active ML and LLM models using API key auth."""
    try:
        r = requests.get(
            f"{BASE_URL}/api/metrics/models",
            headers=HEADERS,
            timeout=5,
        )
        if r.status_code == 200:
            data = r.json()
            return data.get("ml", []), data.get("llm", [])
        else:
            print(f"  ⚠ Could not fetch models: {r.status_code} {r.text}")
            return [], []
    except Exception as e:
        print(f"  ⚠ Connection error: {e}")
        return [], []


def pick_model(ml_models, llm_models):
    """Interactive model picker."""
    all_models = []
    for m in ml_models:
        all_models.append(("ml", m["id"], m["name"]))
    for m in llm_models:
        all_models.append(("llm", m["id"], m["name"]))

    if not all_models:
        print("\n⚠  No models found in the platform.")
        print("   Go to Admin Panel → ML or LLM tab → Add a model first.\n")
        sys.exit(1)

    print("\n╔══════════════════════════════════════════════╗")
    print("║     ObserveML — Model Simulator Launcher    ║")
    print("╚══════════════════════════════════════════════╝\n")
    print("  Available models:\n")
    for idx, (mtype, mid, name) in enumerate(all_models, 1):
        print(f"  [{idx}]  {name}  (type={mtype}, id={mid})")

    print(f"\n  [A]  Simulate ALL models simultaneously\n")

    while True:
        choice = input("  Select model number or 'A' for all: ").strip().upper()
        if choice == "A":
            return all_models
        try:
            n = int(choice)
            if 1 <= n <= len(all_models):
                return [all_models[n - 1]]
        except ValueError:
            pass
        print("  Invalid choice, try again.")


def push(model_type: str, model_id: int, metric_name: str, value: float, name: str):
    """Push one metric reading."""
    resp = requests.post(
        f"{BASE_URL}/api/metrics/ingest",
        headers=HEADERS,
        json={
            "model_id":     model_id,
            "model_type":   model_type,
            "metric_name":  metric_name,
            "metric_value": round(value, 4),
        },
        timeout=5,
    )
    if resp.status_code == 201:
        print(f"  [{name}] ✓ {metric_name:20s} = {round(value, 4)}")
    else:
        print(f"  [{name}] ✗ {metric_name} ERROR {resp.status_code}: {resp.text}")


def simulate_all(selected_models, scenario="random"):
    """Simulate all selected models simultaneously."""
    t = 0
    model_names = ", ".join(m[2] for m in selected_models)
    print(f"\n🚀 Simulating: {model_names}  | Scenario: {scenario.upper()}")
    print(f"   Dashboard: http://localhost:5173/dashboard")
    print(f"   Push interval: {INTERVAL}s  |  Press Ctrl+C to stop\n")

    while True:
        print(f"── t={t}s ──────────────────────────────────────")
        for mtype, mid, name in selected_models:
            if mtype == "ml":
                if scenario == "drift":
                    accuracy   = max(0.70, 0.95 - t * 0.0008 + random.gauss(0, 0.012))
                    drift      = min(0.40, 0.05 + t * 0.0005 + abs(random.gauss(0, 0.015)))
                else:
                    accuracy   = min(1.0, max(0.85, 0.95 + random.gauss(0, 0.012)))
                    drift      = max(0.01, 0.05 + abs(random.gauss(0, 0.015)))
                
                latency    = 50 + math.sin(t * 0.3) * 20 + abs(random.gauss(0, 15))
                throughput = int(120 + math.sin(t * 0.2) * 30 + random.gauss(0, 5))

                push(mtype, mid, "accuracy",         accuracy,   name)
                push(mtype, mid, "drift_score",      drift,      name)
                push(mtype, mid, "latency_ms",       latency,    name)
                push(mtype, mid, "requests_per_min", throughput, name)
            else:
                if scenario == "drift":
                    quality    = max(0.60, 0.92 - t * 0.0003 + random.gauss(0, 0.02))
                else:
                    quality    = min(1.0, max(0.80, 0.92 + random.gauss(0, 0.02)))
                
                latency    = 800 + math.sin(t * 0.2) * 200 + abs(random.gauss(0, 100))
                throughput = int(30 + math.sin(t * 0.15) * 10 + random.gauss(0, 3))

                push(mtype, mid, "quality_score",    quality,    name)
                push(mtype, mid, "latency_ms",       latency,    name)
                push(mtype, mid, "requests_per_min", throughput, name)
        print()
        t += INTERVAL
        time.sleep(INTERVAL)


if __name__ == "__main__":
    scenario_arg = "random"
    if "--scenario" in sys.argv:
        try:
            scenario_arg = sys.argv[sys.argv.index("--scenario") + 1]
        except IndexError:
            pass

    print("\n🔌 Connecting to ObserveML platform...")
    ml_models, llm_models = fetch_models()

    if not ml_models and not llm_models:
        print("\n⚠  Could not list models (you need admin JWT for listing).")
        print("   Enter model info manually:")
        mtype  = input("   model_type (ml/llm): ").strip() or "ml"
        mid    = int(input("   model_id: ").strip())
        mname  = input("   model_name: ").strip() or "My Model"
        selected = [(mtype, mid, mname)]
    else:
        selected = pick_model(ml_models, llm_models)

    try:
        simulate_all(selected, scenario=scenario_arg)
    except KeyboardInterrupt:
        print("\n\n👋 Simulator stopped.")
