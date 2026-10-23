# ObserveML

ObserveML is a unified AI observability platform built with a FastAPI backend and a React frontend. It is designed to monitor ML models, LLM systems, alerting workflows, user access, and overall operational health from a single dashboard.

The platform provides centralized visibility into AI workloads, model performance, alerts, system health, and administrative operations.

## Features

- ML model monitoring dashboard
- LLM monitoring interface
- Model and metric tracking
- Real-time alert tracking and alert management
- Redis-based alert handling and background jobs
- User authentication and role-based access
- Admin user management
- Audit logging
- Configurable user settings
- Health checks and operational status endpoints
- API rate limiting
- Security headers
- Secure environment and backend configuration
- Interactive charts and monitoring dashboards

## Tech Stack

### Backend

- Python 3.11+
- FastAPI
- SQLAlchemy
- PostgreSQL
- Redis
- Pydantic
- Python-dotenv
- SlowAPI
- Alembic

### Frontend

- React
- Vite
- React Router
- Recharts
- Axios

## Project Structure

```text
observability-platform/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── admin.py
│   │   │       ├── alerts.py
│   │   │       ├── auth.py
│   │   │       ├── metrics.py
│   │   │       └── users.py
│   │   │
│   │   ├── models/
│   │   │   ├── alert.py
│   │   │   ├── allowed_domain.py
│   │   │   ├── api_key.py
│   │   │   ├── audit_log.py
│   │   │   ├── llm_model.py
│   │   │   ├── metric_reading.py
│   │   │   ├── ml_model.py
│   │   │   ├── user.py
│   │   │   ├── user_access.py
│   │   │   └── user_setting.py
│   │   │
│   │   ├── services/
│   │   │   ├── alert_service.py
│   │   │   ├── audit.py
│   │   │   ├── auth_service.py
│   │   │   ├── email_service.py
│   │   │   └── metrics_services.py
│   │   │
│   │   ├── schemas/
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   │
│   ├── migrations/
│   ├── tests/
│   ├── requirements.txt
│   ├── alembic.ini
│   └── .env.example
│
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── README.md
│
├── simulate_model.py
├── .gitignore
└── README.md
```

## Prerequisites

Before running ObserveML, make sure the following are installed:

- Python 3.11 or higher
- Node.js 18 or higher
- npm
- PostgreSQL
- Redis
- Git

## Environment Setup

Create a `.env` file inside the `backend` directory.

```env
SECRET_KEY=your-secret-key-of-at-least-32-characters
DATABASE_URL=postgresql://username:password@localhost:5432/observeml
REDIS_URL=redis://localhost:6379/0
APP_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
```

### Environment Variables

| Variable | Description |
|---|---|
| `SECRET_KEY` | Secret key used for secure backend operations. Must contain at least 32 characters. |
| `DATABASE_URL` | PostgreSQL database connection URL. |
| `REDIS_URL` | Redis connection URL used for alert handling and background jobs. |
| `APP_ENV` | Application environment, such as `development` or `production`. |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins. |

### Important Notes

- `SECRET_KEY` must be at least 32 characters long.
- `DATABASE_URL` is required.
- `REDIS_URL` is recommended for alert-related background jobs.
- Do not commit your actual `.env` file to the repository.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/adarshg7/observability-platform.git
cd observability-platform
```

### 2. Install Backend Dependencies

Navigate to the backend directory:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv .venv
```

Activate the virtual environment.

#### Linux/macOS

```bash
source .venv/bin/activate
```

#### Windows

```bash
.venv\Scripts\activate
```

Install the required Python packages:

```bash
pip install -r requirements.txt
```

### 3. Install Frontend Dependencies

Open a new terminal or navigate back to the project root:

```bash
cd ../frontend
```

Install the frontend dependencies:

```bash
npm install
```

## Running the Application

ObserveML consists of two applications: the FastAPI backend and the React frontend.

### Start the Backend

From the `backend` directory:

```bash
cd backend
```

Activate the virtual environment if it is not already active:

```bash
source .venv/bin/activate
```

Start the FastAPI development server:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at:

```text
http://localhost:8000
```

FastAPI's interactive API documentation can be accessed at:

```text
http://localhost:8000/docs
```

### Start the Frontend

From the project root:

```bash
cd frontend
```

Start the Vite development server:

```bash
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:5173
```

## Health Check

The backend provides a health check endpoint:

```http
GET /health
```

The endpoint verifies the basic health of the platform and checks the availability of required dependencies such as the database and Redis.

You can test it using:

```bash
curl http://localhost:8000/health
```

## Backend Architecture

The backend follows a modular structure to separate API routes, database models, business logic, and configuration.

### API Routes

The `app/api/routes/` directory contains the main API endpoints:

- `auth.py` - Authentication and authorization
- `users.py` - User-related operations
- `admin.py` - Administrative operations
- `metrics.py` - Model and metric monitoring
- `alerts.py` - Alert management and alert-related operations

### Models

The `app/models/` directory contains SQLAlchemy database models for:

- Users
- ML models
- LLM models
- Metric readings
- Alerts
- API keys
- User access
- User settings
- Audit logs
- Allowed domains

### Services

The `app/services/` directory contains business logic that is separated from the API routes.

Key services include:

- Authentication service
- Alert service
- Metrics service
- Email service
- Audit logging service

## Frontend

The React frontend provides the main observability dashboard and user interface.

It includes interfaces for:

- ML model monitoring
- LLM monitoring
- Metrics and charts
- Alert management
- User profile
- User settings
- Administrative user management

Recharts is used to display monitoring data through interactive charts.

## Monitoring and Alerts

ObserveML provides centralized monitoring for AI workloads.

The platform can collect and display metric readings for monitored models and use alert services to identify important operational conditions.

Redis is used to support alert-related background processing and improve the handling of asynchronous operations.

## Authentication and Access Control

The platform supports role-aware access control for different types of users.

Administrative users can manage users and platform-level settings, while regular users receive access based on their assigned permissions.

The backend also includes:

- Authentication
- API key management
- User access management
- Audit logging
- Security configuration
- Rate limiting

## Testing

Backend tests are located in:

```text
backend/tests/
```

To run the tests:

```bash
cd backend
pytest
```

## API Documentation

When the backend is running, FastAPI automatically provides interactive API documentation.

Swagger UI:

```text
http://localhost:8000/docs
```

ReDoc:

```text
http://localhost:8000/redoc
```

## Operational Architecture

At a high level, ObserveML follows this architecture:

```text
                    ┌─────────────────────┐
                    │     React Frontend  │
                    │   Vite + Recharts   │
                    └──────────┬──────────┘
                               │
                               │ HTTP / REST API
                               ▼
                    ┌─────────────────────┐
                    │    FastAPI Backend  │
                    │                     │
                    │ Auth │ Metrics      │
                    │ Alerts │ Users      │
                    │ Admin │ Health      │
                    └───────┬─────┬───────┘
                            │     │
                ┌───────────┘     └───────────┐
                ▼                             ▼
       ┌─────────────────┐           ┌─────────────────┐
       │   PostgreSQL    │           │      Redis      │
       │                 │           │                 │
       │ Users           │           │ Alert handling  │
       │ Models          │           │ Background jobs │
       │ Metrics         │           │                 │
       │ Alerts          │           └─────────────────┘
       │ Audit logs      │
       └─────────────────┘
```

## Project Purpose

ObserveML is designed to provide a centralized observability layer for AI and ML systems.

Instead of monitoring models, metrics, alerts, users, and operational status through separate tools, the platform brings these capabilities together into a single dashboard.

The project focuses on:

- AI/ML model monitoring
- LLM observability
- Operational intelligence
- Metric visualization
- Alert workflows
- User and administrative governance
- System health monitoring

## Future Improvements

Potential future enhancements include:

- Advanced ML model performance metrics
- LLM token and latency analytics
- Model drift detection
- Anomaly detection
- Custom alert rules
- Notification integrations such as Slack and email
- Advanced role and permission management
- Model comparison dashboards
- Historical metric analysis
- Production deployment with Docker and Kubernetes

## Summary

ObserveML is a practical AI observability and monitoring platform that provides teams with centralized visibility into ML models, LLM systems, metrics, alerts, users, and operational health.

By combining a FastAPI backend, React dashboard, PostgreSQL database, and Redis-based background processing, ObserveML provides a foundation for monitoring and managing modern AI workloads from a single platform.
