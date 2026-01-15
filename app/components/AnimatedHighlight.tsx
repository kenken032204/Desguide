import React, { useEffect, useRef } from "react";
import { Animated, Text } from "react-native";

const AnimatedHighlight = ({ label, color, icon }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        backgroundColor: color === "#10b981" ? "#d1fae5" : "#fee2e2", // ✅ light green or light red
        borderColor: color,
        borderWidth: 1.5,
        borderRadius: 12,
        padding: 12,
        marginTop: 15,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontWeight: "700",
          color: color === "#10b981" ? "#047857" : "#b91c1c", // ✅ dark green or dark red text
          fontSize: 16,
        }}
      >
        {icon} {label}
      </Text>
    </Animated.View>
  );
};

export default AnimatedHighlight;
