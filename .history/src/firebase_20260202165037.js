// src/firebase.js 
import { initializeApp } from "firebase/app"; 
import { getAuth } from "firebase/auth"; 
import { getDatabase } from "firebase/database"; 
const firebaseConfig = { 
    apiKey: "AIzaSyA4rxRqSjMe1cKz7alcsotaLdTK1UWUKpE", 
    authDomain: "kgrades.firebaseapp.com", 
    databaseURL: "https://kgrades-default-rtdb.firebaseio.com", 
    projectId: "kgrades", storageBucket: "kgrades.firebasestorage.app", 
    messagingSenderId: "393746785062", 
    appId: "1:393746785062:web:f04a52527f3948a9edd7e7", 
    measurementId: "G-DEER1TDFZK" 
}; 
const app = initializeApp(firebaseConfig); 
export const auth = getAuth(app); 
export const db = getDatabase(app);

// Export config for diagnostics
export { firebaseConfig };