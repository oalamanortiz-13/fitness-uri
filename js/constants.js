// Constantes compartidas entre trainer-app.js y client-app.js

export const SUPL_TIMINGS = [
  { value: 'manana',       label: 'Mañana',       icon: 'ti-sunrise',    color: '#BA7517' },
  { value: 'tarde',        label: 'Tarde',         icon: 'ti-sun',        color: '#378ADD' },
  { value: 'noche',        label: 'Noche',         icon: 'ti-moon',       color: '#7C5CBF' },
  { value: 'pre-workout',  label: 'Pre-workout',   icon: 'ti-bolt',       color: '#1D9E75' },
  { value: 'post-workout', label: 'Post-workout',  icon: 'ti-check',      color: '#E24B4A' },
]

export const CARDIO_TYPES = [
  { id: 'correr',       label: 'Correr',           icon: 'ti-run'              },
  { id: 'caminar',      label: 'Caminar rápido',   icon: 'ti-walk'             },
  { id: 'cinta',        label: 'Cinta',             icon: 'ti-treadmill'        },
  { id: 'eliptica',     label: 'Elíptica',          icon: 'ti-arrows-right-left'},
  { id: 'bici',         label: 'Bici estática',     icon: 'ti-bike'             },
  { id: 'spinning',     label: 'Spinning',          icon: 'ti-brand-cycling'    },
  { id: 'remo',         label: 'Remo',              icon: 'ti-ripple'           },
  { id: 'natacion',     label: 'Natación',          icon: 'ti-swim'             },
  { id: 'escaladora',   label: 'Escaladora',        icon: 'ti-stairs-up'        },
  { id: 'comba',        label: 'Comba',             icon: 'ti-circles-relation' },
  { id: 'hiit',         label: 'HIIT',              icon: 'ti-flame'            },
  { id: 'boxing',       label: 'Boxeo / saco',      icon: 'ti-ball-american-football' },
  { id: 'step',         label: 'Step aeróbic',      icon: 'ti-steps'            },
  { id: 'senderismo',   label: 'Senderismo',        icon: 'ti-mountain'         },
]

// Lookup por id para acceso rápido en client-app.js
export const CARDIO_TYPE_BY_ID = Object.fromEntries(CARDIO_TYPES.map(t => [t.id, t]))
