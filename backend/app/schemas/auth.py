from enum import Enum
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# ── Role enum — only these roles can ever exist in the system ─────────
class Role(str, Enum):
    admin     = "admin"
    editor    = "editor"
    viewer    = "viewer"


# ── Request schemas ───────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

    model_config = {"str_strip_whitespace": True}


class RegisterRequest(BaseModel):
    name:     str      = Field(min_length=2,  max_length=50,  description="Full name")
    email:    EmailStr
    password: str      = Field(min_length=8,  max_length=128, description="Min 8 chars")

    model_config = {"str_strip_whitespace": True}

    @field_validator("name")
    @classmethod
    def name_must_be_letters(cls, v: str) -> str:
        # Only letters, spaces, hyphens, apostrophes — no injection attempts
        if not re.match(r"^[A-Za-z\s'\-]+$", v):
            raise ValueError("Name may only contain letters, spaces, hyphens, apostrophes")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        """
        Enforce real password policy.
        WHY: bcrypt is strong, but a weak input is still weak.
        """
        errors = []
        if not any(c.isupper()     for c in v): errors.append("one uppercase letter")
        if not any(c.islower()     for c in v): errors.append("one lowercase letter")
        if not any(c.isdigit()     for c in v): errors.append("one digit")
        if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in v):
            errors.append("one special character (!@#$%...)")
        if errors:
            raise ValueError(f"Password must contain: {', '.join(errors)}")
        return v


# ── Response schemas ──────────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token:  str
    token_type:    str  = "bearer"
    expires_in:    int           # seconds — tells the frontend exactly when to refresh


class UserResponse(BaseModel):
    id:    UUID       # UUID, not int — non-enumerable, can't guess other user IDs
    name:  str
    email: EmailStr
    role:  Role       # always a validated enum value, never an arbitrary string