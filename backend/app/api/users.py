from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.database import get_db
from app.db.models import User, UserGoals, UserProfile
from app.schemas import UserProfileUpdate
from app.services.nutrition_logic import calcular_calorias_harris_benedict 

router = APIRouter()

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Retorna los datos del usuario actual para el frontend."""
    return {
        "email": current_user.email,
        "full_name": current_user.full_name,
        "profile": {
            "age": current_user.profile.age if current_user.profile else None,
            "gender": current_user.profile.gender if current_user.profile else None,
            "height": current_user.profile.height_cm if current_user.profile else None,
            "weight": current_user.profile.weight_kg if current_user.profile else None,
        },
        "goals": {
            "activity_level": current_user.goals.activity_level
            if current_user.goals
            else None,
            "goal": current_user.goals.goal_type if current_user.goals else None,
            "target_calories": current_user.goals.target_calories
            if current_user.goals
            else None,
        },
    }

@router.put("/me")
def update_profile_me(
    data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Actualiza el perfil y las metas del usuario actual y recalcula las calorías objetivo.
    """
    # 1. Actualizar o crear perfil
    if not current_user.profile:
        current_user.profile = UserProfile(user_id=current_user.id)

    current_user.profile.age = data.age
    current_user.profile.weight_kg = data.weight
    current_user.profile.height_cm = data.height
    current_user.profile.gender = data.gender

    # 2. Actualizar metas
    if not current_user.goals:
        current_user.goals = UserGoals(user_id=current_user.id)

    current_user.goals.activity_level = data.activity_level
    current_user.goals.goal_type = data.goal

    # 3. Cálculo de calorías (Harris-Benedict)
    calculo = calcular_calorias_harris_benedict(
        peso_kg=data.weight,
        altura_cm=data.height,
        edad=data.age,
        genero=data.gender,
        nivel_actividad=data.activity_level,
        objetivo=data.goal,
    )

    nuevas_calorias = calculo["calorias_objetivo"]
    current_user.goals.target_calories = nuevas_calorias

    db.commit()

    # 4. Devolvemos el dato calculado
    return {
        "msg": "Perfil actualizado",
        "target_calories": nuevas_calorias,
        "details": calculo,
    }