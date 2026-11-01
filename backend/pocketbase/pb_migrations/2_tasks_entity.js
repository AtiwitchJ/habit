/// <reference path="../pb_data/types.d.ts" />
// Allows `tasks` as a synced entity in the `records` collection. Existing rows are untouched.
migrate(
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    records.fields.getByName('entity').values = ['habits', 'habit_logs', 'tasks'];
    app.save(records);
  },
  (app) => {
    const records = app.findCollectionByNameOrId('records');
    records.fields.getByName('entity').values = ['habits', 'habit_logs'];
    app.save(records);
  },
);
