/// <reference path="../pb_data/types.d.ts" />
// Syncs idempotent gamification rewards keyed by their completion log id.
migrate(
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    records.fields.getByName('entity').values = ['habits', 'habit_logs', 'tasks', 'rewards'];
    app.save(records);
  },
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    records.fields.getByName('entity').values = ['habits', 'habit_logs', 'tasks'];
    app.save(records);
  },
);
