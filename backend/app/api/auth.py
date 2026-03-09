import html
import logging
import os
import re
import time
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

logger = logging.getLogger("NutriPlanner.Auth")

from app.core import security
from app.core.config import settings
from app.db.database import get_db
from app.db.models import (
    ActivityLevel,
    DietType,
    Gender,
    GoalType,
    Subscription,
    User,
    UserGoals,
    UserPreferences,
    UserProfile,
    UserRole,
)

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)

# ==========================================
# Rate Limiting (In-Memory)
# ==========================================
class RateLimiter:
    """Rate limiter simple en memoria para prevenir ataques de fuerza bruta."""

    _MAX_ENTRIES = 10_000
    _CLEANUP_EVERY = 100  # run cleanup every N checks

    def __init__(self) -> None:
        self.attempts: dict[str, list[float]] = defaultdict(list)
        self._check_count = 0

    def _cleanup(self, window_seconds: int = 300) -> None:
        """Remove stale entries to prevent unbounded memory growth."""
        now = time.time()
        stale_keys = [
            k for k, timestamps in self.attempts.items()
            if not timestamps or (now - max(timestamps)) > window_seconds
        ]
        for k in stale_keys:
            del self.attempts[k]

    def is_rate_limited(self, identifier: str, max_attempts: int = 5, window_seconds: int = 300) -> bool:
        """
        Verifica si un identificador (IP o email) ha excedido el límite.

        Args:
            identifier: IP del cliente o email
            max_attempts: Máximo de intentos permitidos
            window_seconds: Ventana de tiempo en segundos

        Returns:
            True si está bloqueado, False si puede continuar
        """
        now = time.time()
        # Limpiar intentos antiguos de este identifier
        self.attempts[identifier] = [
            ts for ts in self.attempts[identifier]
            if now - ts < window_seconds
        ]

        # Periodic global cleanup
        self._check_count += 1
        if self._check_count >= self._CLEANUP_EVERY or len(self.attempts) > self._MAX_ENTRIES:
            self._cleanup(window_seconds)
            self._check_count = 0

        return len(self.attempts[identifier]) >= max_attempts

    def record_attempt(self, identifier: str) -> None:
        """Registra un intento fallido."""
        self.attempts[identifier].append(time.time())

    def clear(self, identifier: str) -> None:
        """Limpia los intentos después de un login o acción exitosos."""
        self.attempts.pop(identifier, None)

# Instancia global del rate limiter
rate_limiter = RateLimiter()

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str

    @field_validator('email')
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        """Valida formato y longitud del email."""
        v = v.strip().lower()
        if not v or len(v) < 5:
            raise ValueError('Email no válido')
        if len(v) > 254:
            raise ValueError('Email demasiado largo')
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError('Formato de email no válido')
        return v

    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Valida que la contraseña tenga mínimo 8 caracteres, una mayúscula y un número."""
        if len(v) < 8:
            raise ValueError('La contraseña debe tener al menos 8 caracteres')
        if not re.search(r'[A-Z]', v):
            raise ValueError('La contraseña debe contener al menos una mayúscula')
        if not re.search(r'[0-9]', v):
            raise ValueError('La contraseña debe contener al menos un número')
        return v

    @field_validator('full_name')
    @classmethod
    def sanitize_full_name(cls, v: str) -> str:
        """Sanitiza el nombre para prevenir XSS/Injection."""
        if not v or len(v.strip()) < 2:
            raise ValueError('El nombre debe tener al menos 2 caracteres')
        if len(v) > 100:
            raise ValueError('El nombre no puede exceder 100 caracteres')
        # Escapar caracteres HTML peligrosos
        sanitized = html.escape(v.strip())
        # Remover caracteres especiales peligrosos pero permitir acentos
        sanitized = re.sub(r'[<>\"\';&]', '', sanitized)
        return sanitized

def _decode_token_email(token: str) -> str | None:
    """Decodifica el token JWT y devuelve el email (sub) o None si no es válido."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        return None
    except Exception:
        return None

    email = payload.get("sub")
    if not isinstance(email, str):
        return None
    return email


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Valida el token JWT para rutas protegidas y devuelve el usuario."""
    email = _decode_token_email(token)
    if email is None:
        raise HTTPException(status_code=401, detail="Token inválido o sesión expirada")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def get_admin_user(
    user: User = Depends(get_current_user),
):
    """Requiere usuario autenticado con rol admin."""
    if not user.subscription or user.subscription.status != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Acceso restringido a administradores")
    return user


def get_optional_user(
    token: str = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
):
    """
    Intenta obtener el usuario actual, pero devuelve None si no hay token o es inválido.
    Permite acceso Guest.
    """
    if not token:
        return None

    email = _decode_token_email(token)
    if email is None:
        return None

    return db.query(User).filter(User.email == email).first()

@router.post("/token")
def login(
    request: LoginRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Endpoint de login: devuelve un JWT válido para el usuario."""
    client_ip = req.client.host if req.client else "unknown"
    email_clean = request.email.lower().strip()

    # Verificar rate limit por IP
    if rate_limiter.is_rate_limited(
        client_ip,
        settings.LOGIN_RATE_LIMIT,
        settings.LOGIN_RATE_WINDOW,
    ):
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Intenta de nuevo en 5 minutos."
        )

    # Verificar rate limit por email
    if rate_limiter.is_rate_limited(
        email_clean,
        settings.LOGIN_RATE_LIMIT,
        settings.LOGIN_RATE_WINDOW,
    ):
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos para este email. Intenta de nuevo en 5 minutos."
        )

    user = db.query(User).filter(User.email == email_clean).first()

    if not user or not security.verify_password(request.password, user.password_hash):
        # Registrar intento fallido
        rate_limiter.record_attempt(client_ip)
        rate_limiter.record_attempt(email_clean)
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    # Login exitoso - limpiar intentos
    rate_limiter.clear(client_ip)
    rate_limiter.clear(email_clean)

    access_token = security.create_access_token(subject=user.email)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "token": access_token,  # BACKWARD COMPATIBILITY
        "user": {
            "email": user.email,
            "full_name": user.full_name,
            "profile": {
                "age": user.profile.age if user.profile else None,
                "weight": user.profile.weight_kg if user.profile else None
            }
        }
    }

@router.post("/register")
def register(
    request: RegisterRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Registro de usuario + creación de entidades relacionadas + login automático."""
    client_ip = req.client.host if req.client else "unknown"
    register_key = f"register_{client_ip}"

    if rate_limiter.is_rate_limited(register_key, max_attempts=3, window_seconds=3600):
        raise HTTPException(
            status_code=429,
            detail="Demasiados registros desde esta IP. Intenta de nuevo en 1 hora."
        )

    email_clean = request.email.lower().strip()

    if db.query(User).filter(User.email == email_clean).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    # Registrar intento de registro
    rate_limiter.record_attempt(register_key)

    hashed_password = security.get_password_hash(request.password)
    new_user = User(full_name=request.full_name, email=email_clean, password_hash=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Crear TODAS las entidades relacionadas
    try:
        # 1. Perfil base
        db.add(
            UserProfile(
                user_id=new_user.id,
                age=30,
                gender=Gender.OTHER.value,
                height_cm=170,
                weight_kg=70,
            )
        )

        # 2. Metas
        db.add(
            UserGoals(
                user_id=new_user.id,
                goal_type=GoalType.MAINTAIN.value,
                activity_level=ActivityLevel.SEDENTARY.value,
            )
        )

        # 3. Preferencias (necesario para la IA)
        db.add(
            UserPreferences(
                user_id=new_user.id,
                diet_type=DietType.OMNIVORE.value,
                weekly_budget=100.0,
                allergies=[],
                hated_foods=[],
            )
        )

        # 4. Suscripción inicial
        db.add(
            Subscription(
                user_id=new_user.id,
                status=UserRole.FREE.value,
            )
        )

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Error al crear perfil completo. Inténtalo de nuevo.",
        )

    # Login automático después del registro
    return login(LoginRequest(email=email_clean, password=request.password), req, db)


# ==========================================
# Password Reset
# ==========================================

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str

    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('La contraseña debe tener al menos 8 caracteres')
        if not re.search(r'[A-Z]', v):
            raise ValueError('La contraseña debe contener al menos una mayúscula')
        if not re.search(r'[0-9]', v):
            raise ValueError('La contraseña debe contener al menos un número')
        return v


def _send_reset_email(to_email: str, reset_url: str) -> bool:
    """Send password reset email via Resend. Returns True on success."""
    api_key = settings.RESEND_API_KEY
    if not api_key:
        logger.warning("RESEND_API_KEY not set — skipping email send for %s", to_email)
        return False

    try:
        import httpx
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": os.getenv("RESEND_FROM_EMAIL", "NutriPlanner <onboarding@resend.dev>"),
                "to": [to_email],
                "subject": "Recupera tu contraseña — NutriPlanner",
                "html": (
                    f"<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
                    f"<h2 style='color:#D27D59'>Recuperar contraseña</h2>"
                    f"<p>Has solicitado restablecer tu contraseña en NutriPlanner.</p>"
                    f"<p><a href='{reset_url}' style='display:inline-block;background:#D27D59;color:white;"
                    f"padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold'>"
                    f"Crear nueva contraseña</a></p>"
                    f"<p style='color:#888;font-size:12px'>Este enlace expira en 1 hora. "
                    f"Si no solicitaste este cambio, ignora este email.</p></div>"
                ),
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            return True
        logger.error("Resend API error %s: %s", resp.status_code, resp.text)
    except Exception as e:
        logger.error("Failed to send reset email: %s", e)
    return False


@router.post("/forgot-password")
def forgot_password(
    request: ForgotPasswordRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Generate a password reset token and send it via email."""
    client_ip = req.client.host if req.client else "unknown"
    reset_key = f"reset_{client_ip}"

    # Rate limit: 3 requests per 15 minutes per IP
    if rate_limiter.is_rate_limited(reset_key, max_attempts=3, window_seconds=900):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Intenta de nuevo en 15 minutos.")

    rate_limiter.record_attempt(reset_key)

    email_clean = request.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()

    # Always return success to prevent email enumeration
    success_msg = {"message": "Si el email existe, recibirás un enlace para recuperar tu contraseña."}

    if not user:
        return success_msg

    # Generate a short-lived JWT for password reset
    reset_token = security.create_access_token(
        subject=user.email,
        expires_delta=timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
    )

    frontend_url = settings.FRONTEND_URL.rstrip("/")
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"

    sent = _send_reset_email(user.email, reset_url)
    if not sent:
        # In dev mode without Resend, return the token directly for testing
        if os.getenv("ENVIRONMENT", "development") != "production":
            return {"message": success_msg["message"], "debug_reset_url": reset_url}

    return success_msg


@router.post("/reset-password")
def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Validate reset token and update the user's password."""
    email = _decode_token_email(request.token)
    if email is None:
        raise HTTPException(status_code=400, detail="Enlace inválido o expirado. Solicita uno nuevo.")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Enlace inválido o expirado. Solicita uno nuevo.")

    user.password_hash = security.get_password_hash(request.password)
    db.commit()

    return {"message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión."}