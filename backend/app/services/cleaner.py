import re
from typing import Dict, List


class IngredientCleaner:
    """Normaliza nombres de ingredientes eliminando ruido y corrigiendo typos."""

    # Palabras básicas de ruido
    DROP_WORDS: List[str] = [
        r"\bde\b",
        r"\ben\b",
        r"\bel\b",
        r"\bla\b",
        r"\blos\b",
        r"\blas\b",
        r"\baprox\.?\b",
        r"\bunidad(es)?\b",
        r"\bpiezas?\b",
        r"\bgramos\b",
        r"\bgr?\b",
        r"\bkilos?\b",
        r"\bkg\b",
        r"\bml\b",
        r"\blitros?\b",
        r"\bpaquete\b",
        r"\bbote\b",
        r"\bfrasco\b",
        r"\blata\b",
        r"\btarro\b",
        r"\bbolsa\b",
    ]

    TYPO_FIXES: Dict[str, str] = {
        "pina": "piña",
        "limon": "limón",
        "jamon": "jamón",
        "atun": "atún",
        "salmon": "salmón",
        "platano": "plátano",
    }

    def clean(self, text: str) -> str:
        """Limpia texto de ingrediente: quita ruido, corrige tildes y normaliza espacios."""
        if not text:
            return ""
        cleaned = text.lower()

        # [FIX] Reemplazar guiones bajos por espacios (Gemini envía nombres con _)
        cleaned = cleaned.replace("_", " ")

        for pattern in self.DROP_WORDS:
            cleaned = re.sub(pattern, " ", cleaned)
        for bad, good in self.TYPO_FIXES.items():
            cleaned = re.sub(rf"\b{bad}\b", good, cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned


ingredient_cleaner = IngredientCleaner()