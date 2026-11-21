import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { autocompletePlaces, fetchPlaceDetails, PlaceDetails, PlacePrediction } from '../api/places';
import { colors } from '../theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (place: PlaceDetails) => void | Promise<void>;
  placeholder?: string;
  hint?: string;
  inputStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

function Icon({ name, size = 18, color = colors.primary }: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function PlaceAutocompleteField({
  label,
  value,
  onChangeText,
  onSelect,
  placeholder = 'Village, town or area',
  hint = 'Select a suggestion to save its map location.',
  inputStyle,
  containerStyle,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const selectedValue = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 3 || selectedValue.current === query) {
      setPredictions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError('');
      autocompletePlaces(query, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setPredictions(results);
            setSearchedQuery(query);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setPredictions([]);
            setSearchError(error instanceof Error ? error.message : 'Could not search places.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [focused, value]);

  async function choosePrediction(prediction: PlacePrediction) {
    setSelecting(true);
    setSearchError('');
    try {
      const place = await fetchPlaceDetails(prediction.placeId);
      const selectedText = (place.area ?? place.address).trim();
      selectedValue.current = selectedText;
      await onSelect(place);
      setPredictions([]);
      setFocused(false);
      Keyboard.dismiss();
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Could not load the selected place.');
    } finally {
      setSelecting(false);
    }
  }

  return <View style={[styles.field, containerStyle]}>
    <Text style={styles.label}>{label}</Text>
    <AppTextInput
      style={[styles.input, inputStyle]}
      value={value}
      onChangeText={(nextValue) => {
        selectedValue.current = null;
        setPredictions([]);
        setSearchError('');
        setSearchedQuery('');
        onChangeText(nextValue);
      }}
      onFocus={() => setFocused(true)}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={label}
    />
    {searching && <View style={styles.status}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.hint}>Searching places…</Text>
    </View>}
    {predictions.length > 0 && <View style={styles.suggestions}>
      {predictions.map((prediction) => <Pressable
        key={prediction.placeId}
        style={styles.suggestion}
        onPress={() => { void choosePrediction(prediction); }}
        disabled={selecting}
        accessibilityRole="button"
      >
        {selecting ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="location-outline" />}
        <Text style={styles.suggestionText} numberOfLines={2}>{prediction.text}</Text>
      </Pressable>)}
    </View>}
    {focused && !searching && value.trim().length >= 3 && searchedQuery === value.trim()
      && predictions.length === 0 && !searchError && <Text style={styles.hint}>No matching places.</Text>}
    {!!searchError && <Text style={styles.error} accessibilityRole="alert">{searchError}</Text>}
    {!searchError && predictions.length === 0 && <Text style={styles.hint}>{hint}</Text>}
    {!searchError && predictions.length > 0 && <Text style={styles.hint}>Select a result to set the location.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  field: { marginBottom: 18 },
  label: { color: colors.muted, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 15, color: colors.text, backgroundColor: colors.surface, fontSize: 15 },
  suggestions: { marginTop: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.surface },
  suggestion: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 5, paddingTop: 8 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 7 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 7 },
});
