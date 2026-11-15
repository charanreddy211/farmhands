import Svg, { Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText, TSpan } from 'react-native-svg';

type Props = {
  width?: number;
  height?: number;
};

export default function BrandLogo({ width = 205, height = 49 }: Props) {
  return <Svg width={width} height={height} viewBox="0 0 1100 260" accessibilityRole="image" accessibilityLabel="Farmhands — local work. Stronger farms.">
    <Defs>
      <LinearGradient id="markGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#60A5FA" />
        <Stop offset="100%" stopColor="#2563EB" />
      </LinearGradient>
      <LinearGradient id="wordGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <Stop offset="0%" stopColor="#2563EB" />
        <Stop offset="100%" stopColor="#60A5FA" />
      </LinearGradient>
    </Defs>
    <G transform="translate(20,20) scale(.4375)">
      <Rect width="512" height="512" rx="116" fill="url(#markGradient)" />
      <Path d="M132 292C132 368 186 410 256 410C326 410 380 368 380 292" fill="none" stroke="#fff" strokeWidth="42" strokeLinecap="round" />
      <Path d="M256 382V236" fill="none" stroke="#fff" strokeWidth="32" strokeLinecap="round" />
      <Path d="M256 278C256 210 208 162 136 162C136 230 182 278 256 278Z" fill="#fff" />
      <Path d="M256 234C256 152 306 98 388 98C388 182 338 234 256 234Z" fill="#fff" />
    </G>
    <SvgText x="270" y="158" fontFamily="Plus Jakarta Sans, Inter, Arial, sans-serif" fontSize="128" fontWeight="800" letterSpacing="-4" fill="#0F172A">
      farm<TSpan fill="url(#wordGradient)">hands</TSpan>
    </SvgText>
    <SvgText x="274" y="210" fontFamily="Plus Jakarta Sans, Inter, Arial, sans-serif" fontSize="22" fontWeight="700" letterSpacing="4" fill="#64748B">
      LOCAL WORK. STRONGER FARMS.
    </SvgText>
  </Svg>;
}
