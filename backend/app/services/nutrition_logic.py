import math

def calcular_calorias_harris_benedict(peso_kg, altura_cm, edad, genero, nivel_actividad, objetivo="mantener"):
    """
    Calcula las calorías exactas usando la fórmula de Harris-Benedict revisada por la OMS.
    
    Args:
        peso_kg (float): Peso en kg.
        altura_cm (int): Altura en cm.
        edad (int): Edad en años.
        genero (str): 'hombre' o 'mujer'.
        nivel_actividad (str): 'muy_ligera', 'ligera', 'moderada', 'intensa', 'excepcional'.
        objetivo (str): 'perder', 'mantener', 'ganar'.
    
    Returns:
        dict: Diccionario con 'calorias_objetivo', 'geb' (basal), 'get' (total) y 'meta_proteina' (opcional).
    """
    
    # 1. Normalización de inputs
    genero = genero.lower().strip()
    nivel_actividad = nivel_actividad.lower().strip()
    
    # Mapeo de Inglés (Modelos) a Español (Lógica interna)
    mapa_genero = {'male': 'hombre', 'female': 'mujer', 'hombre': 'hombre', 'mujer': 'mujer'}
    genero = mapa_genero.get(genero, 'mujer') # Default mujer si no coincide

    mapa_actividad = {
        'sedentary': 'muy_ligera',
        'light': 'ligera', 
        'moderate': 'moderada', 
        'active': 'intensa', 
        'very_active': 'excepcional',
        # Mantener soporte español
        'muy_ligera': 'muy_ligera',
        'ligera': 'ligera',
        'moderada': 'moderada',
        'intensa': 'intensa',
        'excepcional': 'excepcional'
    }
    nivel_actividad = mapa_actividad.get(nivel_actividad, 'muy_ligera')

    mapa_objetivo = {
        'lose_weight': 'perder',
        'maintain': 'mantener',
        'gain_muscle': 'ganar',
        # Mantener soporte español
        'perder': 'perder',
        'mantener': 'mantener',
        'ganar': 'ganar'
    }
    objetivo = mapa_objetivo.get(objetivo, 'mantener')
    
    # 2. Calcular Gasto Energético Basal (GEB) - Fórmula Harris-Benedict
    if genero == 'hombre':
        geb = 66.5 + (13.75 * peso_kg) + (5.003 * altura_cm) - (6.755 * edad)
        # Factores de actividad para Hombres (OMS)
        factores_actividad = {
            'muy_ligera': 1.3, 
            'ligera': 1.6, 
            'moderada': 1.7, 
            'intensa': 2.1, 
            'excepcional': 2.4
        }
    else: # Mujer
        geb = 655 + (9.56 * peso_kg) + (1.85 * altura_cm) - (4.7 * edad)
        # Factores de actividad para Mujeres (OMS)
        factores_actividad = {
            'muy_ligera': 1.3, 
            'ligera': 1.5, 
            'moderada': 1.6, 
            'intensa': 1.9, 
            'excepcional': 2.2
        }

    # 3. Calcular Gasto Energético Total (GET)
    factor = factores_actividad.get(nivel_actividad, 1.3) # Default a sedentario si hay error
    get = geb * factor

    # 4. Ajuste por Objetivo
    calorias_finales = get
    if objetivo == 'perder':
        calorias_finales -= 400  # Déficit calórico
    elif objetivo == 'ganar':
        calorias_finales += 400  # Superávit calórico
    
    # Redondeo
    calorias_finales = int(round(calorias_finales))

    return {
        "calorias_objetivo": calorias_finales,
        "geb_basal": int(geb),
        "get_mantenimiento": int(get),
        "factor_aplicado": factor
    }