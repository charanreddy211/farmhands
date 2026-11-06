import { forwardRef } from 'react';
import { StyleSheet, TextInput as NativeTextInput } from 'react-native';
import type { TextInputProps } from 'react-native';
import { appFontFamily } from './AppText';

const AppTextInput = forwardRef<NativeTextInput, TextInputProps>((props, ref) => {
  const fontWeight = StyleSheet.flatten(props.style)?.fontWeight;
  return <NativeTextInput {...props} ref={ref} style={[props.style, { fontFamily: appFontFamily(fontWeight) }]} />;
});

export default AppTextInput;
