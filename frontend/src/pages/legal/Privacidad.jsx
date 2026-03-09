import { useNavigate } from 'react-router-dom';

export default function Privacidad() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="max-w-2xl mx-auto px-5 py-8">
                <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-[var(--color-primary)] font-medium mb-6 hover:underline">
                    <span className="material-symbols-outlined text-base">arrow_back</span>
                    Volver
                </button>

                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6" style={{ fontFamily: 'var(--font-display)' }}>
                    Politica de Privacidad
                </h1>

                <div className="space-y-6 text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">1. Responsable del tratamiento</h2>
                        <p>NutriPlanner es una aplicacion web de planificacion de comidas. Los datos son tratados por el equipo de desarrollo de NutriPlanner.</p>
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">2. Datos que recogemos</h2>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><b>Cuenta de usuario</b>: email, nombre y contrasena (cifrada con bcrypt).</li>
                            <li><b>Perfil nutricional</b>: peso, altura, edad, genero, nivel de actividad y objetivo (solo si los proporcionas).</li>
                            <li><b>Preferencias alimentarias</b>: dieta, alergias, despensa, miembros de la familia.</li>
                            <li><b>Historial de uso</b>: menus generados, recetas valoradas, lista de la compra.</li>
                            <li><b>Datos de navegacion</b>: solo si aceptas cookies analiticas (PostHog). Incluye paginas visitadas y eventos de interaccion. No recogemos datos financieros ni de pago.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">3. Finalidad del tratamiento</h2>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Generar menus semanales personalizados.</li>
                            <li>Calcular listas de compra con precios de supermercado.</li>
                            <li>Mejorar las recomendaciones de recetas.</li>
                            <li>Analizar el uso de la app para mejorar la experiencia (solo con consentimiento).</li>
                            <li>Deteccion de errores tecnicos (Sentry, solo con consentimiento).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">4. Base legal</h2>
                        <p>
                            El tratamiento de tus datos se basa en tu <b>consentimiento</b> (art. 6.1.a RGPD) para la creacion de cuenta y el uso de cookies analiticas.
                            Para el funcionamiento basico de la app (generacion de menus, lista de compra), la base legal es la <b>ejecucion del servicio</b> (art. 6.1.b RGPD).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">5. Cookies y servicios de terceros</h2>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><b>PostHog</b> (analitica): solo se activa si aceptas "todas las cookies". Servidor en la UE (eu.i.posthog.com).</li>
                            <li><b>Sentry</b> (errores): solo se activa si aceptas "todas las cookies". Registra errores tecnicos para mejorar la estabilidad.</li>
                            <li><b>Cookies esenciales</b>: token de sesion (JWT en localStorage) y preferencias de la app. Estas son necesarias para el funcionamiento basico.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">6. Tus derechos (ARCO+)</h2>
                        <p>Tienes derecho a:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><b>Acceso</b>: consultar tus datos en la seccion Perfil de la app.</li>
                            <li><b>Rectificacion</b>: modificar tus datos en Perfil y Metricas.</li>
                            <li><b>Supresion</b>: solicitar la eliminacion de tu cuenta enviando un email.</li>
                            <li><b>Oposicion</b>: retirar el consentimiento de cookies en cualquier momento desde Ajustes.</li>
                            <li><b>Portabilidad</b>: exportar tus datos en formato JSON.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">7. Seguridad</h2>
                        <p>
                            Las contrasenas se almacenan cifradas con bcrypt. Las comunicaciones se realizan por HTTPS.
                            Los tokens de sesion expiran a las 24 horas. El acceso a los endpoints de administracion requiere autenticacion de nivel admin.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-2">8. Contacto</h2>
                        <p>
                            Para ejercer tus derechos o cualquier consulta sobre privacidad, contacta con nosotros en:
                            <b> privacidad@nutriplanner.app</b>
                        </p>
                    </section>

                    <p className="text-xs text-[var(--color-text-muted)] pt-4 border-t border-[var(--color-border)]">
                        Ultima actualizacion: marzo 2026
                    </p>
                </div>
            </div>
        </div>
    );
}
