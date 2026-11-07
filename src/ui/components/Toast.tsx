import { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import { useApp } from '../../state/store';
import { RADIUS, useTheme } from '../theme';

/** 畫面下方的短暫提示（「已加入 5 張」） */
export function Toast() {
  const { toast } = useApp();
  const { c, f } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const [text, setText] = useState('');

  useEffect(() => {
    if (!toast) return;
    setText(toast.text);
    opacity.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.delay(2400),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [toast?.id]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        bottom: 90,
        alignSelf: 'center',
        maxWidth: '86%',
        opacity,
        backgroundColor: c.ink,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: RADIUS.m,
      }}
    >
      <Text
        style={{
          color: c.paper,
          fontSize: 14,
          fontFamily: f.ui,
          textAlign: 'center',
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}
