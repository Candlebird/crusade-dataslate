/** Firebase web config. Not secret: the Firestore security rules (firestore.rules) are what protect the data. */
export const firebaseConfig = {
  apiKey: 'AIzaSyBHBFpcIP-S9m7hp6nEa07Y7aTlaE01cRA',
  authDomain: 'crusade-dataslate.firebaseapp.com',
  projectId: 'crusade-dataslate',
  storageBucket: 'crusade-dataslate.firebasestorage.app',
  messagingSenderId: '765607704790',
  appId: '1:765607704790:web:cc6bc5539e268daacdb177',
};

/** Keep in step with firestore.rules. Other players are let in by the GM from the Settings page. */
export const GM_EMAIL = 'brestel.jason@gmail.com';
