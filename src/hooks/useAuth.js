import { useState, useEffect } from "react";
import { subscribeToAuthChanges } from "../firebase/auth";

/**
 * Хук для відстеження стану автентифікації
 */
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe;
    
    try {
      unsubscribe = subscribeToAuthChanges((userData) => {
        setUser(userData);
        setLoading(false);
      });
    } catch (error) {
      console.error("Помилка ініціалізаціїAuth:", error);
      setLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return { user, loading, isAuthenticated: !!user };
};
