from pydantic import BaseModel, EmailStr, Field, field_validator
from uuid import UUID
from app.schemas.auth import Role
import re


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=50)

    model_config = {"str_strip_whitespace": True}

    @field_validator("name")
    @classmethod
    def name_must_be_valid(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z\s'\-]+$", v):
            raise ValueError("Name may only contain letters, spaces, hyphens, apostrophes")
        return v


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password:     str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        errors = []
        if not any(c.isupper() for c in v):                              errors.append("uppercase letter")
        if not any(c.islower() for c in v):                              errors.append("lowercase letter")
        if not any(c.isdigit() for c in v):                              errors.append("digit")
        if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in v):      errors.append("special character")
        if errors:
            raise ValueError(f"Password must contain: {', '.join(errors)}")
        return v


class ProfileResponse(BaseModel):
    id:         UUID
    name:       str
    email:      EmailStr
    role:       Role
    created_at: str   # ISO string — frontend formats it