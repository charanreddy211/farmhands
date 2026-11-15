import type { ComponentProps } from 'react';
import { StyleSheet, Text as NativeText } from 'react-native';
import type { TextStyle } from 'react-native';

const fontByWeight = {
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
} as const;

export function appFontFamily(fontWeight: TextStyle['fontWeight'] | undefined): string {
  const weight = fontWeight ?? '400';
  return weight in fontByWeight
    ? fontByWeight[weight as keyof typeof fontByWeight]
    : fontByWeight['400'];
}

export default function AppText(props: ComponentProps<typeof NativeText>) {
  const fontWeight = StyleSheet.flatten(props.style)?.fontWeight;

  return <NativeText {...props} style={[props.style, { fontFamily: appFontFamily(fontWeight) }]} />;
}
