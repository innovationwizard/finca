# Glosario — Finca Danilandia

Términos del dominio cuyo significado en este sistema no es obvio o se presta a
confusión. Mantener breve; una entrada por término.

---

## Jornal

**Un "jornal" es el trabajo realizado en un día (un evento de asistencia), no una
jornada laboral de tiempo completo.**

> Definición del cliente (verbatim): _"'Jornal' is the work done in one day. If
> employee attends, does work for one hour, then leaves, this is one 'Jornal'.
> Not equal to one full-time day of work, the referenced mínimo legal agrícola."_

Implicaciones:

- Si un trabajador llega, trabaja una hora y se retira, eso cuenta como **un (1)
  jornal** — igual que si hubiera trabajado el día completo. El jornal mide la
  asistencia/participación en una actividad, no las horas.
- Por eso el **precio por jornal NO es directamente comparable con el salario
  mínimo legal agrícola por día** (Q119.21/día, Acuerdo Gubernativo 256-2025). Un
  precio de jornal por debajo de esa cifra **no implica** incumplimiento del
  mínimo: son unidades distintas (jornal = participación en una actividad; mínimo
  legal = día completo de trabajo).
- Ejemplo concreto: la actividad **MG** (Mantenimiento General) se registra como
  **1 jornal = Q75.00** (unidad: Día). Esto es correcto bajo la definición de
  jornal de arriba, aunque Q75 sea menor a Q119.21/día.

Dónde aparece en el sistema:

- Catálogo de actividades (`/admin/actividades`): el precio se configura "por
  unidad de trabajo"; para actividades con unidad **Día**, esa unidad es el
  jornal. La nota al pie de esa pantalla menciona el mínimo legal por día — léase
  junto con esta aclaración (jornal ≠ día completo).
- Captura semanal (`/planilla/captura`): cada celda registra unidades de trabajo;
  para actividades por Día, las unidades son jornales.
