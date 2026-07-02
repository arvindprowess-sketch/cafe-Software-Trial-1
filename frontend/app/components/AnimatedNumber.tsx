import React, { useEffect } from 'react';
import { TextInput, TextStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, Easing,
} from 'react-native-reanimated';
import { useReduceMotion } from './PressableScale';

// Reanimated can drive a TextInput's `text` prop straight on the UI thread,
// which lets a number roll old -> new without a JS re-render per frame.
Animated.addWhitelistedNativeProps({ text: true });
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type Props = {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

// A number that counts up/down to `value` (~400ms ease-out), rounding each
// frame. Reduce Motion -> snaps instantly. Rendered via a read-only TextInput
// so the roll runs on the UI thread.
export default function AnimatedNumber({ value, prefix = '', suffix = '', duration = 400, style, testID }: Props) {
  const sv = useSharedValue(value);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion.current) {
      sv.value = value;
    } else {
      sv.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
    }
  }, [value]);

  const animatedProps = useAnimatedProps(() => {
    const shown = Math.round(sv.value);
    return { text: `${prefix}${shown}${suffix}` } as any;
  });

  return (
    <AnimatedTextInput
      testID={testID}
      editable={false}
      underlineColorAndroid="transparent"
      // TextInput ships platform padding; reset it so it lines up like a <Text>.
      style={[{ padding: 0 }, style]}
      value={`${prefix}${Math.round(value)}${suffix}`}
      animatedProps={animatedProps}
    />
  );
}
