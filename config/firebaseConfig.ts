// firebaseConfig.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAUIaQKKgRvH5mpJpljYH2n7uzgtHI1Bug",
  authDomain: "carpool-database-adef5.firebaseapp.com",
  databaseURL: "https://carpool-database-adef5-default-rtdb.firebaseio.com",
  projectId: "carpool-database-adef5",
  storageBucket: "carpool-database-adef5.appspot.com",
  messagingSenderId: "672930609159",
  appId: "1:672930609159:web:adecdc7713b0897587d2a2",
  measurementId: "G-Y8ELX0V8G7"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);

export { app, db };
