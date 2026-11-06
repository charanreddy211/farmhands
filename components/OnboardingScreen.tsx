import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { ProfileDetails, updateProfile, UserProfile } from '../api/profile';
import { reverseGeocodeLocation } from '../api/places';

type Props = {
  userId: string;
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

export default function OnboardingScreen({ userId, profile, onProfileChange }: Props) {
  const [role, setRole] = useState<'farmer' | 'labour' | null>(() => profile.roles[0] ?? null);
  const [language, setLanguage] = useState<'en' | 'te'>(profile.preferredLanguage ?? 'en');
  const [step, setStep] = useState<'role' | 'language' | 'farmer'>(() =>
    profile.roles.includes('farmer') && !profile.onboardingComplete ? 'farmer' : 'role');
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [address, setAddress] = useState(profile.homeAddress);
  const [mapLink, setMapLink] = useState(profile.homeAddressMapLink);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  async function useLocation() {
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Allow location access or enter your farm location manually.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const place = await reverseGeocodeLocation(position.coords.latitude, position.coords.longitude);
      setAddress(place.address);
      setMapLink(place.mapLink);
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Could not locate your farm. Enter the location manually.');
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!role) {
      setError('Choose how you want to use Farmhands.');
      return;
    }
    if (role === 'farmer' && (!firstName.trim() || !address.trim())) {
      setError('Enter your name and farm location to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const input: Partial<ProfileDetails> = {
        roles: [role],
        preferredLanguage: language,
        ...(role === 'farmer' ? {
          firstName: firstName.trim(),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
          homeAddress: address.trim(),
          homeAddressMapLink: mapLink,
          onboardingComplete: true,
        } : {}),
      };
      const saved = await updateProfile(userId, input);
      onProfileChange(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function continueSetup() {
    if (step === 'role') {
      if (!role) {
        setError('Choose how you want to use Farmhands.');
        return;
      }
      setError('');
      setStep('language');
      return;
    }
    if (step === 'language' && role === 'farmer') {
      setError('');
      setStep('farmer');
      return;
    }
    void save();
  }

  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{step === 'role'
      ? <>How will you <Text style={styles.titleAccent}>use Farmhands?</Text></>
      : step === 'language'
        ? <>Choose your <Text style={styles.titleAccent}>language</Text></>
        : <>Tell us about <Text style={styles.titleAccent}>your farm</Text></>}</Text>
    <Text style={styles.subtitle}>{step === 'role'
      ? 'మీరు తర్వాత మీ ప్రొఫైల్‌లో మార్చుకోవచ్చు.'
      : step === 'language'
        ? 'మీకు నచ్చిన భాషను ఎంచుకోండి.'
        : 'మీ వ్యవసాయ పనికి దగ్గరలో ఉన్న కూలీలను కనుగొనండి.'}</Text>

    {step === 'role' ? <>
      <Pressable style={[styles.roleCard, role === 'farmer' && styles.selectedCard]} onPress={() => setRole('farmer')} accessibilityRole="radio" accessibilityState={{ selected: role === 'farmer' }}>
        <View style={styles.roleIcon}><Ionicons name="car-outline" size={24} color="#0F172A" /></View>
        <View style={styles.roleCopy}><Text style={styles.roleTitle}>I need workers</Text><Text style={styles.roleDescription}>నా వ్యవసాయ పనికి కూలీలు కావాలి</Text></View>
        <View style={[styles.roleCheck, role === 'farmer' && styles.roleCheckSelected]}>{role === 'farmer' && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}</View>
      </Pressable>
      <Pressable style={[styles.roleCard, role === 'labour' && styles.selectedCard]} onPress={() => setRole('labour')} accessibilityRole="radio" accessibilityState={{ selected: role === 'labour' }}>
        <View style={styles.roleIcon}><Ionicons name="person-outline" size={24} color="#0F172A" /></View>
        <View style={styles.roleCopy}><Text style={styles.roleTitle}>I want work</Text><Text style={styles.roleDescription}>నాకు వ్యవసాయ పని కావాలి</Text></View>
        <View style={[styles.roleCheck, role === 'labour' && styles.roleCheckSelected]}>{role === 'labour' && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}</View>
      </Pressable>
    </> : step === 'language' ? <>
      <Text style={styles.fieldLabel}>APP LANGUAGE</Text>
      <View style={styles.languageRow}>
        {(['te', 'en'] as const).map((value) => <Pressable key={value} onPress={() => setLanguage(value)} style={[styles.languageChoice, language === value && styles.languageSelected]} accessibilityRole="radio" accessibilityState={{ selected: language === value }}>
          <View style={styles.languageCopy}>
            <Text style={styles.languageText}>{value === 'en' ? 'English' : 'తెలుగు'}</Text>
            <Text style={styles.languageTranslation}>{value === 'en' ? 'ఇంగ్లీష్' : 'Telugu'}</Text>
          </View>
          <View style={[styles.languageRadio, language === value && styles.languageRadioSelected]}>
            {language === value && <View style={styles.languageRadioDot} />}
          </View>
        </Pressable>)}
      </View>
    </> : <>
      <Text style={styles.fieldLabel}>YOUR NAME</Text>
      <AppTextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" autoComplete="given-name" />
      <AppTextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" autoComplete="family-name" />
      <Text style={[styles.fieldLabel, styles.locationLabel]}>FARM LOCATION</Text>
      <AppTextInput style={styles.input} value={address} onChangeText={(value) => { setAddress(value); setMapLink(null); }} placeholder="Village, town or area" />
      <Pressable style={styles.locationButton} onPress={() => { void useLocation(); }} disabled={locating} accessibilityRole="button">
        {locating ? <ActivityIndicator color="#2563EB" /> : <Ionicons name="locate-outline" size={18} color="#2563EB" />}
        <Text style={styles.locationText}>{locating ? 'Finding location…' : 'Use current location'}</Text>
      </Pressable>
      <Text style={styles.hint}>You can add or adjust your farm details in your profile later.</Text>
    </>}

    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    <View style={styles.actions}>
      {step !== 'role' && <Pressable style={styles.backButton} onPress={() => setStep(step === 'farmer' ? 'language' : 'role')} accessibilityRole="button"><Text style={styles.backText}>Back</Text></Pressable>}
      <Pressable style={[styles.continueButton, loading && styles.disabled]} onPress={() => {
        continueSetup();
      }} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.continueText}>{step === 'farmer' ? 'Finish setup' : 'Continue'}</Text>}
      </Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, paddingTop: 38, paddingBottom: 26, backgroundColor: 'transparent' },
  title: { color: '#0F172A', fontSize: 32, lineHeight: 39, fontWeight: '800', letterSpacing: -0.7 },
  titleAccent: { color: '#3477F6' },
  subtitle: { color: '#64748B', fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 24 },
  roleCard: { minHeight: 96, borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectedCard: { borderColor: '#2563EB', borderWidth: 2 },
  roleIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  roleCheck: { width: 27, height: 27, borderRadius: 8, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  roleCheckSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  roleCopy: { flex: 1 },
  roleTitle: { color: '#0F172A', fontSize: 18, fontWeight: '700' },
  roleDescription: { color: '#64748B', fontSize: 14, marginTop: 4 },
  fieldLabel: { color: '#64748B', fontWeight: '700', fontSize: 14, letterSpacing: 0.8, marginTop: 22, marginBottom: 12 },
  languageRow: { flexDirection: 'column', gap: 14 },
  languageChoice: { minHeight: 82, paddingHorizontal: 20, borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  languageCopy: { alignItems: 'flex-start', gap: 3 },
  languageSelected: { borderColor: '#2563EB', borderWidth: 2 },
  languageRadio: { width: 28, height: 28, borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  languageRadioSelected: { borderColor: '#2563EB' },
  languageRadioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#2563EB' },
  languageText: { color: '#0F172A', fontWeight: '600', fontSize: 17 },
  languageTranslation: { color: '#64748B', fontWeight: '500', fontSize: 14 },
  input: { minHeight: 54, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 13, color: '#0F172A', fontSize: 16, marginBottom: 10 },
  locationLabel: { marginTop: 16 },
  locationButton: { minHeight: 52, borderRadius: 26, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  locationText: { color: '#0F172A', fontWeight: '700' },
  hint: { color: '#64748B', fontSize: 13, lineHeight: 18, marginTop: 8 },
  error: { color: '#A0443D', fontSize: 13, marginTop: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 'auto', paddingTop: 30 },
  backButton: { minHeight: 56, borderRadius: 28, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  backText: { color: '#0F172A', fontWeight: '700' },
  continueButton: { flex: 1, minHeight: 58, borderRadius: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2563EB' },
  continueText: { color: '#FFFFFF', fontWeight: '700', fontSize: 18 },
  disabled: { opacity: 0.65 },
});
