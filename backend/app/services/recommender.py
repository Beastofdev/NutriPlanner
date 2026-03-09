"""
Recipe recommender service.

Uses collaborative filtering via SQL:
1. Find recipes the current user has liked/favorited
2. Find other users who also liked those same recipes
3. Find recipes those similar users liked that the current user hasn't rated
4. Rank by overlap count (more similar users liked it = higher rank)

Fallback (cold start / no ratings): Top recipes by global community score.
"""

import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import IS_POSTGRES

logger = logging.getLogger("NutriPlanner.Recommender")


def get_recommendations(db: Session, user_id: int, limit: int = 12) -> list[dict]:
    """
    Get personalized recipe recommendations for a user.

    Returns list of recipe dicts with recommendation_score.
    """
    # Step 1: Check if user has any positive ratings
    user_positive = db.execute(text("""
        SELECT recipe_id FROM user_recipe_ratings
        WHERE user_id = :uid AND rating IN ('favorite', 'like')
    """), {"uid": user_id}).fetchall()

    if len(user_positive) >= 2:
        # Collaborative filtering path
        results = _collaborative_filter(db, user_id, limit)
        if results:
            return results

    # Fallback: global popularity (cold start)
    return _global_popular(db, user_id, limit)


def _collaborative_filter(db: Session, user_id: int, limit: int) -> list[dict]:
    """
    Collaborative filtering: find recipes liked by similar users.

    SQL approach:
    - CTE 1: recipes this user liked
    - CTE 2: other users who liked at least one of those recipes
    - CTE 3: recipes those users liked, excluding ones this user already rated
    - Rank by how many similar users liked each recipe
    """
    rows = db.execute(text("""
        WITH my_likes AS (
            SELECT recipe_id FROM user_recipe_ratings
            WHERE user_id = :uid AND rating IN ('favorite', 'like')
        ),
        similar_users AS (
            SELECT urr.user_id, COUNT(*) AS overlap
            FROM user_recipe_ratings urr
            JOIN my_likes ml ON ml.recipe_id = urr.recipe_id
            WHERE urr.user_id != :uid AND urr.rating IN ('favorite', 'like')
            GROUP BY urr.user_id
        ),
        candidates AS (
            SELECT urr.recipe_id,
                   SUM(su.overlap) AS relevance_score,
                   COUNT(DISTINCT urr.user_id) AS recommender_count
            FROM user_recipe_ratings urr
            JOIN similar_users su ON su.user_id = urr.user_id
            WHERE urr.rating IN ('favorite', 'like')
              AND urr.recipe_id NOT IN (
                  SELECT recipe_id FROM user_recipe_ratings WHERE user_id = :uid
              )
            GROUP BY urr.recipe_id
        )
        SELECT r.id, r.name, r.calories, r.protein, r.carbs, r.fats,
               r.image_url, r.meal_type, r.suitable_diets,
               r.prep_time_minutes, r.difficulty,
               c.relevance_score, c.recommender_count
        FROM candidates c
        JOIN recipes r ON r.id = c.recipe_id
        WHERE r.is_verified = true
        ORDER BY c.relevance_score DESC, c.recommender_count DESC
        LIMIT :lim
    """), {"uid": user_id, "lim": limit}).fetchall()

    return [_row_to_dict(r, source="collaborative") for r in rows]


def _global_popular(db: Session, user_id: int, limit: int) -> list[dict]:
    """
    Fallback: top recipes by global community score.
    Excludes recipes the user already rated.
    """
    if IS_POSTGRES:
        ratings_sub = """
            SELECT recipe_id,
                   COUNT(*) AS rating_count,
                   ROUND(
                       (COUNT(*) FILTER (WHERE rating = 'favorite') * 2.0
                        + COUNT(*) FILTER (WHERE rating = 'like')
                        - COUNT(*) FILTER (WHERE rating = 'dislike') * 0.5
                       ) / NULLIF(COUNT(*), 0)::numeric,
                   2) AS avg_score
            FROM user_recipe_ratings
            GROUP BY recipe_id
        """
    else:
        ratings_sub = """
            SELECT recipe_id,
                   COUNT(*) AS rating_count,
                   ROUND(
                       (SUM(CASE WHEN rating = 'favorite' THEN 2.0 ELSE 0 END)
                        + SUM(CASE WHEN rating = 'like' THEN 1.0 ELSE 0 END)
                        - SUM(CASE WHEN rating = 'dislike' THEN 0.5 ELSE 0 END)
                       ) / MAX(COUNT(*), 1),
                   2) AS avg_score
            FROM user_recipe_ratings
            GROUP BY recipe_id
        """

    rows = db.execute(text(f"""
        SELECT r.id, r.name, r.calories, r.protein, r.carbs, r.fats,
               r.image_url, r.meal_type, r.suitable_diets,
               r.prep_time_minutes, r.difficulty,
               COALESCE(rs.avg_score, 0) AS avg_score,
               COALESCE(rs.rating_count, 0) AS rating_count
        FROM recipes r
        LEFT JOIN ({ratings_sub}) rs ON rs.recipe_id = r.id
        WHERE r.is_verified = {"TRUE" if IS_POSTGRES else "1"}
          AND r.id NOT IN (
              SELECT recipe_id FROM user_recipe_ratings WHERE user_id = :uid
          )
        ORDER BY COALESCE(rs.avg_score, 0) DESC, COALESCE(rs.rating_count, 0) DESC, r.name
        LIMIT :lim
    """), {"uid": user_id, "lim": limit}).fetchall()

    return [_row_to_dict(r, source="popular") for r in rows]


def _row_to_dict(r, source: str) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "calories": r.calories,
        "protein": round(r.protein, 1),
        "carbs": round(r.carbs, 1),
        "fats": round(r.fats, 1),
        "image_url": r.image_url,
        "meal_type": r.meal_type,
        "suitable_diets": list(r.suitable_diets) if r.suitable_diets else [],
        "prep_time_minutes": r.prep_time_minutes,
        "difficulty": r.difficulty,
        "source": source,
    }
