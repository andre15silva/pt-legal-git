# ProcessTrack

The legislative process of an iniciativa as a step track — Entrada → Admissão → Generalidade → Especialidade → Votação final global → Promulgação → Publicação — the "pull request" view in Portuguese procedural terms.

- Provide: `stages` `[{label, date?, state: 'done'|'current'|'todo'|'stopped', note?}]`, optional `title`.
- `stopped` (✕) is for caducidade, rejection or veto not overridden: name which in `note`, using the procedural term ("Rejeitado", "Caducou no fim da legislatura") — never "failed".
- The current step is dashed in `pendente`. Done steps are solid `verde`.
