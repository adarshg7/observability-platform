from pydantic import BaseModel
from typing import List
from datetime import datetime

class MLMetricPoint(BaseModel):
    """A single data point in time"""
    timestamp: str
    accuracy: float
    drift_score: float
    latency_ms: float

class MLModelSummary(BaseModel):
    """Summary card for one ML model"""
    model_config = {"protected_namespaces": ()}
    model_id: str
    model_name: str
    model_version: str
    status: str
    current_accuracy: float
    current_drift: float
    current_latency_ms: float
    last_updated: str

class MLMetricResponse(BaseModel):
    """Full respnse for the metrics endpoint"""
    models: List[MLModelSummary]
    chart_data: List[MLMetricPoint]
    total_models: int
    healthy_count: int
    warning_count: int
    critical_count: int


class LLMMetricsPoint(BaseModel):
    """Single time-series point for LLM monitoring"""
    timestamp: str
    latency_ms : float
    tokens_per_second: float
    quality_score: float

class LLMModelSummary(BaseModel):
    """Summary Crd for one LLm Model"""
    service_id : str
    service_name: str
    model_version: str
    status: str
    avg_latency_ms: float
    avg_tokens_per_sec: float
    hallucination_rate: float
    total_requests_today: int
    cost_today_usd: float
    last_updated: str

class LLMMetricResponse(BaseModel):
    """Full response for LLM metrics endpoint"""
    services: List[LLMModelSummary]
    chart_data: List[LLMMetricsPoint]
    total_requests_today: int
    total_services: int
    total_cost_today_usd: float
    avg_hallucination_rate: float