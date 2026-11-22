// Même suite que api.test.js, sur un vrai MongoDB temporaire (téléchargé au 1er lancement, ~100 Mo).
//   npm run test:mongo        (ou TEST_MONGO_URI=... pour une base de test existante — elle sera vidée)
process.env.TEST_STORE = 'mongo';
await import('./api.test.js');
