# STUD — flujo sencillo y entrega eficiente

Fecha: 2026-09-29. Estado: **PLAN PROPUESTO; IMPLEMENTACIÓN NO INICIADA**.

**Actualización 6 octubre:** el estado anterior corresponde al diseño inicial.
Tras la autorización explícita de continuar con el recorrido conectado, comienza
una primera entrega de navegación en `codex/stud-ux1-navigation`, desde `7f95dda`.
M16 sigue abierto; no se integra ni se declara cerrado para empezar esta rama.
La dirección años/asignaturas se implementa; el workbench rechazado no se da por
aprobado. Véase `STUD_UX1_NAVIGATION_VALIDATION.md` para alcance, evidencia y
pendientes. No se afirma que UX-1 completo ni el flujo IA estén terminados.

## 1. Autoridad, alcance y prioridad

Este documento registra la dirección UX expresada por el usuario: navegar por
años, asignaturas y trabajos; entender el material; elegir trabajo humano o IA.
No autoriza comenzar la implementación, sustituir el Master PDF, marcar M16
terminado, realizar commits de documentación ni publicar una release.

Orden: **cerrar M16 → simplificar STUD y validar con el usuario → Map/Gods Eye**.
El diseño puede acordarse ahora, mientras M16 sigue abierto. Implementar después
de su cierre o de una nueva decisión explícita del usuario; no mezclar ramas.

Autoridades: [Master PDF](AEGIS_STUD_ASSIGNMENT_WORKFLOW_ENGINE_SPEC.pdf),
[README](README.md), [arquitectura](STUD_ASSIGNMENT_WORKFLOW_ENGINE_ARCHITECTURE.md),
[roadmap M1–M16](STUD_ASSIGNMENT_WORKFLOW_ENGINE_ROADMAP.md). El informe
`STUD_M16_FINAL_ACCEPTANCE_VALIDATION.md` todavía está en la rama M16, no en
integración; no se ofrece como enlace local hasta que se integre. Releer estos
documentos y el informe M16 en su versión integrada al comenzar código.

Baseline inspeccionado, no supuesto cierre:

- Integración `feature/systems-online-pass`: `44107a5` (M15).
- Trabajo M16: `codex/stud-m16-final-acceptance`, `f0515d3`; cambios de validación
  adicionales sin commit. Aplicación 2.7.1; esquema 28 en el informe M16.
- No mover ni sobrescribir estos cambios para empezar UX. No incorporar datos
  privados ni las capturas de Moodle del usuario a fixtures, docs o releases.

## 2. Contrato de experiencia

```text
Año → Asignatura → Contenido / trabajo → Entender requisitos
                                           ↓
                                      Empezar trabajo
                                      ↙             ↘
                               Por mi cuenta       Con IA
                                      ↘             ↙
                                     Revisar resultado → Exportar
```

Una superficie central cambia de contenido. No se acumulan paneles por cada
nivel. Ruta y Atrás siempre visibles; configuración detrás de Opciones.

| Nivel | Se muestra por defecto | No se muestra por defecto |
| --- | --- | --- |
| Años | Botones 2023/24, 2024/25, etc.; actual destacado; años anteriores plegables | Evaluaciones mezcladas de todos los años, alertas globales, indicadores técnicos |
| Asignaturas | Solo las del año elegido; T1/T2 u otros períodos confirmados; nombre legible | IDs, listas de otros años, contadores ACTIVE ambiguos |
| Asignatura | Contenido real organizado: información, clases, lecturas, evaluaciones; nombres útiles | LABEL/LTI, políticas internas, instrucciones de plantilla como material principal |
| Trabajo | Qué entregar, fecha, requisitos esenciales, información pendiente, Empezar trabajo | DAG, contratos, hashes, configuración del coordinador |
| Elección | Por mi cuenta / Con IA | Catálogo de herramientas antes de empezar |
| Trabajando | Resultado o fuente principal; acción actual; pregunta concreta si hace falta | Telemetría permanente, logs decorativos, controles que no funcionan |
| Resultado | Vista previa, revisar/corregir, aprobar y exportar | Supuesta aprobación automática o entrega universitaria |

Reglas para cerrar en UX-0:

- Año académico no equivale automáticamente a año natural. Mantener 2025/26
  cuando así lo establezcan los datos. Año/período desconocido sigue accesible
  como «Sin clasificar»; nunca esconderlo para aparentar una lista limpia.
- El año actual es una selección explícita/corregible, respaldada por datos
  fiables donde existan; no «el último curso sincronizado». El próximo año
  puede existir en Moodle sin ser aún el curso actual.
- Sin límite fijo de tres asignaturas, dos términos ni seis módulos.
- Cada nivel sustituye el anterior. La búsqueda está disponible como acción
  discreta, no como panel vacío permanente. Contenido largo usa paginación/lazy
  loading sin ocultar el hecho de que quedan elementos por cargar.
- Un estado «sin entregas conocidas» no equivale a «no tienes trabajos»; explicar
  si el material no se ha analizado, está incompleto o no publica esa información.
- Los nombres presentados son una capa corregible. Conservar nombre original,
  identidad, fuente y evidencia del alias; no renombrar Moodle ni cambiar IDs.
- IA puede proponer nombres y clasificación desde contenido, con incertidumbre
  honesta. No inventar fechas, requisitos, revisión o relaciones académicas.
- No quitar funciones avanzadas: acceso contextual en Detalles/Herramientas.
  Evitar dos navegaciones completas compitiendo por la misma tarea.
- La elección humano/IA no duplica Assignment, Notes, fuentes o borradores.
  Cambiar de modalidad conserva el trabajo; no lanza operaciones por navegar.
- Manual Courses/Assignments siguen accesibles como vía secundaria sin Moodle.

## 3. Realidad del motor que no debe esconder el diseño

Inspección acotada del código M16; verificar nuevamente al implementar.

| Componente | Evidencia actual | Decisión |
| --- | --- | --- |
| `studWorkingContextService.class.js` | `courseOrganisation()` agrupa campos guardados; consulta hasta 500 Courses/Assignments globales; prioriza por activos/fechas y marca primero como current | Reutilizar identidad/contexto; corregir selección de año y lecturas por ámbito. No interpretar una lista truncada como completa |
| `studCommandCenter.class.js` | HOME/COURSES/WORK/LIBRARY/STUDY/TOOLS; vistas especializadas y contexto | Refactor de presentación; no nuevo almacén ni catorce pestañas visibles |
| `studLmsRuntime.class.js` | SSO, preferencias automáticas, sync incremental e importación de archivos; `performSync()` no demuestra por sí mismo análisis semántico completo | Reutilizar; enlazar después extracción/clasificación incremental, no autenticar otra vez ni duplicar descarga |
| `studDocumentRuntime.class.js` y AcademicStore | PDFs, extracciones, chunks y provenance canónicos | Reutilizar; mostrar OCR, límites y fuentes no disponibles honestamente |
| M1 Requirements service/workspace | Candidatos, revisión, aprobación independiente de completitud/frescura | Reutilizar con revisión humana breve y comprensible; no aprobar desde un botón genérico de inicio |
| M5 `studAssignmentWorkspace.class.js` | Preview y especialistas sobre objetos existentes | Reutilizar adapters; no segundo lector PDF ni segundo banco de trabajo |
| `studRunCoordinator.class.js` | `classifyNode()` marca RESEARCH como MANUAL_ONLY | **Brecha funcional confirmada:** un botón no convierte investigación en automática |
| `studTaskHandlerRegistry.class.js` | Checks deterministas, candidato de sección, transformación editorial, revisión y corrección; pide inputs/sesiones canónicas | Reutilizar y conectar preparación autorizada; no declarar flujo autónomo completo |
| M13/M16 validación | Probe local de 3B registrado LIMITED/NO_SUITABLE_MODEL | Capacidad insuficiente es un bloqueo real, no un problema de etiquetas; revalidar modelos disponibles, sin instalaciones ocultas |
| M6/M15 | Eventos reales, artifacts, paquete y aprobación humana; salida documentada HTML/Markdown | Reutilizar; no prometer PDF/DOCX nativo sin una decisión aparte |

Rutas bajo `src/classes/workspaces/` salvo indicación. Antes de cada hito leer
solo los servicios afectados, sus contratos IPC y pruebas; no toda la aplicación.

La automatización completa requiere trabajo real de integración, no solo CSS.
Investigación externa sigue las APIs/proveedores permitidos y consentimiento
acotado. No crear navegador genérico, shell, proxy o acceso libre a archivos.

## 4. Forma de trabajo para reducir gasto y retrabajo

1. **Diseño primero en conversación:** una propuesta, un recorrido concreto y
   excepciones relevantes. No producir tres variantes completas si una basta.
2. UX-0 se cierra con cuatro esquemas principales y el estado de ejecución.
   Si resulta necesario comprobar interacción, un único HTML sintético pequeño
   fuera de la app, reutilizable. No React nuevo, servidor, ImageGen ni gran
   suite de capturas para discutir botones.
3. No implementar componentes desechables del prototipo como otra arquitectura.
   Sus estados y textos aprobados se traducen a los componentes existentes.
4. Un hito de producto completo por rama, no un commit por botón. Primera
   ejecución de Electron cuando exista un recorrido coherente; pruebas de
   servicios pueden correr antes. Commit tras pruebas y validación real, no antes.
5. Ciclo de edición: pruebas afectadas y revisión del diff. Cierre de hito:
   regresión acordada, UI real y seguridad. Repetir tras correcciones pertinentes,
   no la suite completa después de cada cambio de texto. No reducir gates para
   ahorrar tokens ni heredar como PASS resultados de otra versión.
6. No DMG por cada ajuste. Construir cuando cambie preload/startup/native/runtime
   o para entrega significativa final. Reutilizar evidencias solo con identidad
   de código y ámbito explícitos; un prototipo nunca acredita Electron/DMG.
7. Handoff de una página: HEAD/base, objetivo, decisiones cerradas, 5–10 archivos
   relevantes, pruebas con resultados, cambios pendientes y siguiente acción.
   No volver a pegar todo el historial ni dieciséis prompts en cada sesión.
8. Logs a disco; devolver resumen y fallos. Capturas de regiones relevantes,
   sintéticas, solo cuando haya una cuestión visual concreta. Reutilizar fixtures.
9. Cambiar modelo por hito o tipo de problema, no por cada archivo. Sin comités
   paralelos ni múltiples revisiones idénticas. Una revisión seria por frontera
   de seguridad/integración y al cierre.
10. No dar una cifra de tokens sin medición. Registrar uso si el entorno lo
    expone, tiempo, reintentos, alcance y pruebas. Coste, tokens y cuota de cuenta
    son cosas distintas; escoger modelo barato no garantiza menos tokens.

## 5. Modelos y esfuerzo

Recomendación de ingeniería para este proyecto, no benchmark ni cambio automático
de la configuración del usuario. Opciones indicadas según catálogo disponible en
esta app; revalidar al iniciar una sesión futura.

| Trabajo | Modelo / esfuerzo inicial | Razón y escalado |
| --- | --- | --- |
| UX-0: decidir flujo y fronteras | GPT-6 Astra / HIGH; MEDIUM para iterar textos/esquemas ya decididos | Resolver ambigüedad una vez, no rediseñar durante implementación |
| UX-1 y UI acotada de UX-3 | GPT-6 Sol / MEDIUM | Alcance y diseño cerrados; HIGH solo ante estado/contexto complejo |
| UX-2: datos, análisis y provenance | GPT-6 Sol / HIGH | Riesgo de clasificación falsa, persistencia y procesamiento incremental |
| UX-4: contrato de automatización | GPT-6 Astra / HIGH en revisión inicial; GPT-6 Sol / HIGH para implementar | Mayor riesgo: autoridad, ejecución, recuperación e identidad de fuentes |
| UX-5: regresión y correcciones acotadas | GPT-6 Sol / MEDIUM; Astra / HIGH para auditoría final limitada al diff y riesgos | No repetir auditoría arquitectónica completa después de cada ajuste |
| Ediciones mecánicas aisladas | GPT-6 Luna / LOW, opcional | Solo si el ahorro supera transferir contexto; nunca decisiones de aprobación o seguridad |

No usar XHIGH/MAX por defecto. Escalar ante un problema identificado que necesite
análisis mayor; volver al nivel habitual al resolverlo. No rebajar esfuerzo a
ciegas en migraciones o flujos con autoridad solo para gastar menos.

Esto selecciona el **modelo de desarrollo en Codex**, no los modelos locales de
Aegis/Ollama. No añade OpenAI/cloud al producto ni promete que un modelo del Mac
pueda ejecutar todas las tareas académicas.

Fuentes consultadas 2026-09-29: OpenAI describe Sol como opción cotidiana para
código y Astra para análisis difícil; recomienda comparar con los mismos inputs
y conservar la opción más ligera que alcance la calidad necesaria.
[Selección de modelos](https://developers.openai.com/api/docs/guides/model-selection).
Menor esfuerzo favorece velocidad y menor uso de tokens; el resultado depende de
modelo/tarea. [Reasoning](https://developers.openai.com/api/docs/guides/reasoning).
Las asignaciones de la tabla son nuestra recomendación, no una receta oficial.

## 6. Hitos con entregas completas

### UX-0 — Acordar la experiencia, sin app ni commit

- **Resultado:** cuatro esquemas: años; asignaturas; contenido; trabajo con
  elección humano/IA. Un quinto estado muestra ejecución/pregunta/resultado.
- **Alcance:** ruta/Atrás, textos, jerarquía, acción principal, información oculta,
  curso próximo/anterior, desconocidos, error, pendiente y falta de modelo.
- **Dependencia:** dirección del usuario; diseño paralelo al cierre de M16.
- **No incluye:** código de aplicación, esquema, IA invocada ni nueva navegación
  implementada. Este roadmap es la preparación, no aprobación de los esquemas.
- **Aceptación:** el usuario puede recorrer en el esquema «buscar asignatura,
  abrir trabajo, entender entrega, elegir modalidad» sin aprender jerga interna.
- **Validación:** revisión aquí; registrar decisiones en este mismo documento.
- **Git/DMG:** ninguno. Siguiente acción: presentar primer esquema simple.

### UX-1 — Navegación que se entiende

- **Resultado:** años → asignaturas del año → contenido; botones sustituyen
  contenido, ruta coherente y año actual corregible. Primera entrega útil real.
- **Alcance:** eliminar mezcla de años, códigos principales, listas repetidas y
  contadores ambiguos. No eliminar contenido que aún no se sabe clasificar.
- **Componentes:** CommandCenter, WorkingContextService, Moodle workspace,
  CSS de STUD; typed IPC solo si hacen falta consultas acotadas por año/curso.
- **Persistencia:** reutilizar Course/Assignment/contexto. Si falta selección de
  año persistente, extender el mecanismo apropiado con prueba de migración;
  ninguna base nueva ni localStorage académico. Esquema no prefijado hoy.
- **Depende:** M16 cerrado y UX-0 aprobado. **No incluye:** análisis IA nuevo,
  automatización académica, reconstrucción de otras áreas Aegis.
- **Pruebas:** año actual y futuro, anteriores, año/término desconocido, >500
  Assignments sin falsas listas vacías, corrección, Atrás/reinicio, neutralidad
  institucional, no llamadas de proveedor/modelo por navegar.
- **Validación real:** Dark/Light/System, tres tamaños acordados, teclado/foco,
  nombres largos; M2/M5/Moodle y límites IPC. Entrega al usuario para recorrido.
- **Commit:** uno de hito validado; no release por defecto.

### UX-2 — Moodle legible y preparación incremental

- **Resultado:** materiales comprensibles, evaluaciones reconocibles y fechas
  trazables; nuevas importaciones se preparan sin repetir configuración.
- **Alcance:** consentimiento sencillo para importar/analizar al sincronizar;
  extracción y clasificación local acotadas, alias corregibles, deduplicación y
  reanálisis de contenido cambiado. Preferencia auto-sync sigue OFF hasta activar.
- **Componentes:** LMS runtime/managed files, Document runtime, local AI boundary,
  presentación de recursos, candidato Requirements y provenance existente.
- **Persistencia:** fuente/IDs originales intactos; reutilizar observaciones y
  decisiones. Solo nueva relación/caché versionada si el modelo actual no basta:
  hash de entrada, versión del analizador/modelo, resultado y corrección humana.
- **IA:** después de consentimiento, contenido es datos no instrucciones; salida
  estructurada y validada. Cache por fuente/hash; no invocar modelo al abrir
  pantalla. IA ausente: identificación parcial honesta, no nombres inventados.
- **Depende:** UX-1. **No incluye:** lanzar trabajos por sincronizar, autoconfirmar
  contratos, fuentes web nuevas, entrenamiento/model downloads silenciosos.
- **Pruebas:** documento/Assignment vs submission point; títulos ambiguos;
  plantilla/import incompleto; OCR; fechas contradictorias/zona horaria;
  corrección que sobrevive nueva sync; offline/reinicio/cancelación; límites y
  prompt injection sin posibilidad de otorgar autoridad.
- **Validación:** fixtures multidisciplinares; caso real solo privado; reanalizar
  no cambia approvals previos. LMS/Document/M1/Context/seguridad sin regresión.
- **Commit:** entrega coherente tras validar; DMG si la nueva frontera lo exige.

### UX-3 — Entender y empezar un trabajo

- **Resultado:** requisitos claros y dos modalidades; ruta manual completa
  lectura → notas/escritura → revisión → exportación soportada.
- **Alcance:** resumen con fuente, dudas relevantes, aprobación explícita simple
  incluida aprobación incompleta, vista previa grande y herramientas contextuales.
  La selección manual/IA conserva identidad y contenido; no duplica expedientes.
- **Componentes:** M1, M2, M5, Research/Notes/Citations, M10/M15; estado de
  presentación. Contratos y versiones existentes siguen siendo autoridad.
- **Persistencia:** ninguna prevista salvo preferencia útil que no exista;
  revisión y notas usan APIs actuales con versiones esperadas.
- **Depende:** UX-2. **No incluye:** desbloquear IA no disponible o fingir flujo
  completo. Opción IA muestra alcance y disponibilidad reales, no botón inerte.
- **Pruebas:** draft/aprobado/incompleto/fuente cambiada; citas exactas, edición y
  exportación manual, cambio modalidad, contexto, reinicio y concurrencia.
- **Validación:** usuario puede explicar qué entrega y dónde lo leyó; teclado y
  viewport compacto; M1/M5/M8/M10/M15, privacidad y seguridad.
- **Commit:** hito manual completo, no partes cosméticas aisladas.

### UX-4 — «Con IA» significa ejecución real

- **Resultado:** un inicio explícito prepara y ejecuta un plan acotado de trabajo
  sobre capacidades reales; preguntas concretas solo ante decisiones necesarias.
- **Trabajo previo corto:** matriz etapa → inputs → handler actual → resultado →
  gate humano → permiso. Diferenciar reutilizable, falta conexión, no soportado.
  No confundir un check determinista con investigación o redacción terminadas.
- **Construcción interna:** (A) preparación/candidatos y contexto; (B) handlers
  faltantes de adquisición permitida y encadenamiento; (C) ejecución/recuperación
  y resultado. Son cortes de implementación, no tres releases ni rediseños.
- **Componentes:** M7/M9 Research, M8 Evidence, M10–M12, M13 handler registry/router/
  coordinator, M4 gates, M6 observabilidad y M15 exportación.
- **Persistencia:** reutilizar planes/attempts/checkpoints, source IDs y versiones.
  Registrar autorización, inputs y resultados reales; nueva migración solo si
  un contrato indispensable no cabe. No segundo scheduler/cola/base.
- **Autorización:** breve revisión del plan y fuentes permitidas antes de iniciar.
  Simplificar confirmaciones repetidas, no falsificar revisión humana de fuentes,
  Claims, requisitos o aprobación final. Autocreación de propuestas != aprobación.
- **Recursos:** perfil seguro por defecto, intensivo opcional bajo Opciones;
  respetar presión de memoria, disco, batería y cancelación. No instalar modelos
  ni mover datos sin autorización aparte. Revalidar modelo por capacidad, no por
  nombre/tamaño únicamente; no cloud fallback.
- **Depende:** UX-3 y matriz técnica aprobada. **No incluye:** libertad de shell/
  web/fs, universidad automática, run overnight independiente del proceso,
  contenido académico inventado ni afirmación universal de calidad.
- **Pruebas:** click único no duplica run; estado real; handlers idempotentes;
  presupuesto y límites; cancelar/reiniciar/reanudar; source drift; modelo
  insuficiente; inputs humanos; rama independiente continúa; citas verificables;
  sin providers/modelos fuera del plan; no aceptación de borrador en secreto.
- **Aceptación:** un caso sintético completo con motor/modelo realmente capaces
  y otro incompleto muestran resultado y bloqueos honestos. Un rechazo correcto
  NO demuestra el flujo automático completo: registrar gate pendiente si falta
  capacidad, no cerrar con un modelo simulado ni ocultar investigación manual.
- **Validación:** revisión real de recorrido y Mission Control solo al necesitarlo;
  todos los servicios tocados más seguridad/regresión. Auditoría Astra puntual.
- **Commit:** entrega funcional completa tras gates; si alcance supera un hito
  razonable, acordar división con resultados útiles antes de ampliar código.

### UX-5 — Aceptación humana y entrega

- **Resultado:** versión instalable que el usuario pueda usar sin instrucciones
  técnicas; solo después se libera la prioridad Map.
- **Alcance:** corregir problemas observados, accesibilidad, privacidad,
  consistencia y rendimiento. No nueva feature ni expansión de automatización.
- **Depende:** UX-1–4 y límites conocidos publicados. **Persistencia:** ninguna
  nueva salvo corrección demostrada; compatibilidad con dataset real obligatoria.
- **Recorrido de aceptación:** elegir año/asignatura; localizar entrega/fecha;
  abrir fuente; usar manual o IA; responder una pregunta; continuar tras reinicio;
  revisar/exportar. Usuario lo hace sin explicación de DAG/contratos/IPC.
- **Medir:** éxito por tarea, ayuda necesaria, confusiones, clics de recuperación y
  tiempos observados; no inventar puntuación o declarar éxito por screenshot.
- **Visual:** Dark, Light, System→Dark/Light; 1680×1050 @2x, 1440×900 @2x,
  1200×780 @1x; foco, teclado, escala, scroll, textos largos, vacíos/errores.
- **Regresión:** STUD completo, Moodle, PDF, Citation.js, compute, local AI,
  Calendar, terminal/node-pty, otras áreas Aegis, trust boundary, release-health,
  prebuild guard. Fallos heredados separados con evidencia vigente.
- **Entrega:** commit validado; DMG ARM64 del código identificado, inspección
  asar, montaje/arranque y recorrido real. Release solo según política/autorización
  vigente. No copiar datos/capturas reales a assets públicos. Registrar aceptación
  del usuario explícita; no asumirla al entregar el instalador.

## 7. Gates comunes y siguiente sesión

Cada hito termina con: qué puede hacer el usuario; cambio mínimo; pruebas del
diff; recorrido real; limitaciones; identidad de build/commit cuando proceda.
No cerrar un hito para ahorrar tokens si tiene un defecto bloqueante.

Brief reutilizable de ejecución (máximo una página, rellenar al comenzar):

```text
Hito y resultado visible:
Base/branch verificados; cambios previos preservados:
Diseño aprobado y decisiones cerradas:
Archivos/contratos relevantes:
Alcance y no-goals:
Aceptación y pruebas obligatorias:
Modelo/esfuerzo elegido; motivo de cualquier escalado:
Último resultado comprobado y siguiente acción concreta:
```

Próximo paso: **UX-0 — presentar aquí el esquema de Años → Asignaturas** y
recorrer un ejemplo sintético; después Contenido → Trabajo → Humano/IA.
No ejecutar pruebas, app, importaciones, modelos ni hacer commits para discutir
ese esquema. M16 continúa pendiente de su cierre técnico, separado del diseño.

## 8. UX-0 — primera propuesta interactiva (2026-09-29)

Estado: **DIRECCIÓN DE NAVEGACIÓN ACEPTADA; BANCO DE TRABAJO EN DISEÑO**.
El usuario respondió «Me gusta, tiene buena pinta» y autorizó continuar con el
banco de trabajo. Esto no aprueba todos los detalles ni la implementación.
No cerrar UX-0 ni iniciar UX-1 hasta acordar el recorrido. Ningún runtime, dato académico,
esquema, modelo, integración, commit o release se ha modificado en este paso.

Se preparó `stud-simple-flow.html` en la superficie de conversación, fuera del
repositorio: años → asignaturas por T1/T2 → material/trabajo → requisitos →
elección humano/IA. Incluye preview de fuente, notas efímeras y un ejemplo
explícitamente simulado de petición de información. No produce resultados,
llamadas ni actividad reales. Colores de propuesta: marfil/dorado en claro,
contraste azul suave en oscuro; no es un reemplazo de los estilos actuales.

Validación acotada del boceto, **no aceptación Electron**: 120 comprobaciones
de navegación y geometría, temas claro/oscuro, anchos 1024/736/375/320; cero
excepciones JavaScript observadas. Inspección visual de asignaturas y trabajo.
No se instaló navegador: se utilizó Chrome existente con un perfil temporal de
prueba. Estos checks ligeros del prototipo no son la suite de la aplicación.

Todos los años reutilizan deliberadamente un catálogo ficticio y todos los
módulos un trabajo ficticio: el objetivo es decidir interacción, no simular
datos reales o capacidad académica. Las notas de prueba no se mandan al modelo
ni se guardan en Aegis. No publicar las capturas privadas del usuario.

La jerarquía y sustitución del contenido son la base acordada. Pendiente con el
usuario: cómo quiere ver la investigación y los resultados durante el trabajo.
La automatización completa sigue siendo UX-4; el boceto no acredita su implementación.

### Segunda propuesta: banco de trabajo (pendiente de revisión)

`stud-workbench.html`, también fuera del repositorio y visible en conversación,
conserva el mismo lenguaje visual y presenta una única superficie para manual/IA:

- El borrador es el contenido principal. Material abre la fuente al lado y
  Notas despliega notas contextuales; Requisitos permanece plegado.
- Cambiar de modalidad conserva texto y notas del boceto. El motor futuro no
  debe sobrescribir escritura humana con candidatos IA sin revisión explícita.
- IA presenta un inicio explícito, pregunta concreta, continuación independiente,
  pausa/reanudación y detalle de actividad plegado; no contadores ni animación.
- Los ajustes del boceto permiten explorar modelo no disponible y revisión.
  No son opciones que deban quedar permanentemente en la interfaz del producto.
- Revisión muestra únicamente el texto escrito en el boceto; no inventa fuentes,
  borrador académico, aprobación o exportación. No se guarda en Aegis.
- Estado de navegación puede recordarse en el visor de la conversación. Texto,
  notas y respuesta de prueba no se incluyen en ese estado ni se envían al modelo.

Sigue siendo UX-0, no implementación, aceptación de Electron ni cierre M16.

## 9. Corrección del recorrido y verificación técnica — 6 octubre 2026

**BANCO DE TRABAJO NO ACEPTADO.** El usuario rechazó la segunda propuesta:
no entendía su finalidad ni sus botones. La aprobación anterior corresponde a
la navegación por años/asignaturas, no al workbench ni al cierre UX-0. No seguir
produciendo pantallas desconectadas como prueba de funcionamiento.

Decisiones explícitas para la implementación posterior:

- Recorrido completo desde asignaturas del año elegido hasta un trabajo real,
  con contenido y fecha identificables; nunca abrir por defecto en la mitad de
  un ejemplo genérico sin ruta.
- Elegir «Con IA» es la acción de inicio. No añadir una segunda confirmación de
  inicio por comodidad técnica. Las autorizaciones imprescindibles deben estar
  integradas en esa decisión; no convertirlas en revisión académica ficticia.
- Durante trabajo IA no aparecen editor manual, Material, Notas, requisitos,
  selector de modalidad ni revisión prematura. Contenido real en uso y
  Pausar/Detener, con controles honestos según capacidad.
- Preguntar únicamente por una decisión/dato genuinamente necesario; ninguna
  pregunta artificial obligatoria al empezar. Resultado/revisión al terminar.
- Preview de la consulta realmente ejecutada, la fuente utilizada o el texto
  recibido, a su velocidad real. Sin retrasos mínimos, escritura reconstruida,
  simulaciones ni sustitución del contenido por un resumen de actividad.
- Si un paso no está implementado o el modelo no es apto, explicar el bloqueo
  concreto. No representar una pantalla con datos ficticios como ejecución.

### Matriz de conexiones comprobadas (código M16 `f0515d3`)

| Paso visible | Implementación comprobada | Falta antes de prometer el flujo sencillo |
| --- | --- | --- |
| Asignatura del año elegido | `studWorkingContextService.courseOrganisation()` + `studCommandCenter.renderModules()` | Año actual corregible y navegación única; hoy `current` es una prioridad por estado/fechas, no confirmación del curso del usuario. Lecturas globales acotadas pueden truncar. |
| Trabajo y requisitos | `selectAssignment()`, M1 y M5 sobre identidad canónica | Presentación clara y revisión contextual, sin mostrar todos los sistemas internos ni fabricar aprobaciones. |
| Investigar | `studResearchRuntime.searchOpenAlex()`, resolución bibliográfica y OA gestionado; Faculty Scout tiene acciones explícitas | El coordinador deja `RESEARCH` en `MANUAL_ONLY`; falta preparación/encadenamiento autorizado. No hay investigación automática al pulsar IA. |
| Redactar | `StudTaskHandlerRegistry.draft()` genera candidato de sección; `StudRunCoordinator.draftInput()` conserva Claims/Evidence revisados | Contrato actual aprobado, plan de composición revisado, sección y evidencia válida; preparación y revisión no se resuelven ocultando controles. Modelo apto pendiente de validación real. |
| Ver lo que escribe | `assistantOllamaClient.chat()` devuelve respuesta completa con `stream: false` | Recepción progresiva acotada, canal tipado por ejecución y vista provisional; no guardar fragmentos como versiones aprobadas. No cambiar todos los consumidores de chat sin tests. |
| Ver documento/consulta | M5 ya resuelve fuentes exactas; Mission Control observa eventos/artefactos | Vincular operación real a selección de preview sin robar contexto manual. Consulta/resultados deben proceder del proveedor real, no del título de una etapa. |
| Pausar/detener | Coordinador, cancelación y política de handlers existentes | Mantener semántica: pausar planificación no implica congelar tokens de un modelo que no soporta pausa. Sin controles ficticios. |
| Revisar/exportar | M10–M15: versiones, revisión y exportación gestionada | Conectar resultado al trabajo sin duplicar objetos; aprobación final humana y cero entrega universitaria automática. |

`studMissionControlWorkspace.scheduleRefresh()` consulta estado cada 2 segundos;
`renderDraftCandidates()` muestra candidatos ya devueltos. Esto no es un canal
de contenido incremental y no satisface por sí solo la preview solicitada.

El tramo técnico M16 se ha retomado por separado: corrección de harness de
provenance empaquetada, validación del DMG existente y regresión. No se ha
modificado la UI de la aplicación ni cerrado M16/UX. El informe M16 sigue en su
rama; conservar esta separación y no iniciar Map. La siguiente entrega visible
debe ser un recorrido coherente, no otra revisión de botones aislados.
