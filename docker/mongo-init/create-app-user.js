// Runs once, on the first start with an empty data volume (docker-entrypoint-initdb.d).
// Creates the least-privilege account the API connects with: readWrite on `auth` only.
const user = process.env.MONGO_APP_USERNAME;
const pwd = process.env.MONGO_APP_PASSWORD;

if (!user || !pwd) {
  throw new Error('MONGO_APP_USERNAME and MONGO_APP_PASSWORD must be set');
}

db.getSiblingDB('auth').createUser({
  user,
  pwd,
  roles: [{ role: 'readWrite', db: 'auth' }],
});
