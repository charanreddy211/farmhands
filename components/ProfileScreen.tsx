import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { fetchProfile, ProfileDetails, updateProfile, uploadProfileImage, UserProfile } from '../api/profile';
import { reverseGeocodeLocation } from '../api/places';

type Props = {
  userId: string;
  phone: string;
  onBack: () => void;
  onProfileChange: (profile: UserProfile) => void;
  onSignOut: () => Promise<void>;
};

function Icon({ name, size = 18, color = '#2563EB' }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function ProfileScreen({ userId, phone, onBack, onProfileChange, onSignOut }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchProfile(userId)
      .then((userProfile) => {
        if (!active) return;
        setProfile(userProfile);
        onProfileChange(userProfile);
      })
      .catch(() => {
        if (active) setError('Could not load your profile. Check your connection and try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, onProfileChange]);

  function beginProfileEdit() {
    if (!profile) return;
    setDraft({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      homeAddress: profile.homeAddress,
      homeAddressMapLink: profile.homeAddressMapLink,
      profileImageUrl: profile.profileImageUrl,
      roles: [...profile.roles],
      preferredLanguage: profile.preferredLanguage,
      onboardingComplete: profile.onboardingComplete,
      labourSkills: [...profile.labourSkills],
      labourArea: profile.labourArea,
      labourDailyRate: profile.labourDailyRate,
      labourTravelRadius: profile.labourTravelRadius,
      labourLatitude: null,
      labourLongitude: null,
      labourAvailable: profile.labourAvailable,
      labourAvailableDates: [...profile.labourAvailableDates],
      labourShift: profile.labourShift,
      farms: profile.farms,
    });
    setSelectedImage(null);
    setError('');
    setEditingProfile(true);
  }

  async function chooseProfileImage() {
    setError('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError('Allow photo library access to choose a profile image.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) setSelectedImage(result.assets[0]);
    } catch {
      setError('Could not open your photo library. Please try again.');
    }
  }

  async function saveProfile() {
    if (!draft) return;
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError('Enter your first and last name before saving.');
      return;
    }
    if (!draft.roles.length) {
      setError('Keep at least one account role selected.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const profileImageUrl = selectedImage
        ? await uploadProfileImage(userId, selectedImage)
        : draft.profileImageUrl?.trim() || null;
      const { labourLatitude: _labourLatitude, labourLongitude: _labourLongitude, ...profileFields } = draft;
      const savedProfile = await updateProfile(userId, {
        ...profileFields,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email?.trim() || null,
        homeAddress: draft.homeAddress.trim(),
        homeAddressMapLink: draft.homeAddressMapLink,
        profileImageUrl,
      });
      setProfile(savedProfile);
      onProfileChange(savedProfile);
      setEditingProfile(false);
      setDraft(null);
      setSelectedImage(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Your profile or photo could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function useCurrentLocation() {
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Allow location access to use your current location as your home address.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = location.coords;
      const { address, mapLink } = await reverseGeocodeLocation(latitude, longitude);

      if (draft) {
        setDraft({ ...draft, homeAddress: address, homeAddressMapLink: mapLink });
      }
    } catch {
      setError('Could not find the area name for your location. Check your connection and Google Geocoding API configuration, then try again.');
    } finally {
      setLocating(false);
    }
  }

  async function openMap(mapLink: string | null) {
    if (!mapLink) {
      Alert.alert('Map link needed', 'Use your current location to add a map link to your home address.');
      return;
    }
    try {
      await Linking.openURL(mapLink);
    } catch {
      Alert.alert('Could not open map', 'Check that the saved map link is valid and try again.');
    }
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await onSignOut();
    } catch {
      setSignOutError('Could not sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : '';

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <View style={styles.headingRow}>
      <View><Text style={styles.heading}>My profile</Text><Text style={styles.subtitle}>Your details, your land, your work.</Text></View>
      <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to local network">
        <Icon name="arrow-back" size={17} /><Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>

    {loading && <Text style={styles.message}>Loading your profile…</Text>}
    {!loading && error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => {
      setLoading(true);
      fetchProfile(userId).then((loaded) => { setProfile(loaded); onProfileChange(loaded); setError(''); }).catch(() => setError('Could not load your profile. Check your connection and try again.')).finally(() => setLoading(false));
    }}><Text style={styles.retry}>Try again</Text></Pressable></View>}

    {!loading && profile && <>
      <View style={styles.card}>
        <View style={styles.cardHeader}><Text style={styles.cardHeading}>Personal details</Text>{!editingProfile && <Pressable style={styles.editButton} onPress={beginProfileEdit}><Icon name="pencil" size={14} /><Text style={styles.editText}>Edit</Text></Pressable>}</View>
        <View style={styles.personRow}>
          {editingProfile && draft
            ? <Pressable style={styles.photoPicker} onPress={() => { void chooseProfileImage(); }} accessibilityRole="button" accessibilityLabel="Choose profile photo">
              {selectedImage?.uri || draft.profileImageUrl
                ? <Image source={{ uri: selectedImage?.uri ?? draft.profileImageUrl ?? undefined }} style={styles.avatar} />
                : <View style={styles.avatarFallback}><Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase() || 'F'}</Text></View>}
              <View style={styles.photoPickerBadge}><Icon name="camera" size={13} color="#FFFFFF" /></View>
            </Pressable>
            : profile.profileImageUrl
              ? <Image source={{ uri: profile.profileImageUrl }} style={styles.avatar} />
              : <View style={styles.avatarFallback}><Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase() || 'F'}</Text></View>}
          <View style={styles.personInfo}>
            <Text style={styles.personName}>{name || 'Your name'}</Text>
            <View style={styles.roles}>{profile.roles.map((role) => <View key={role} style={[styles.roleBadge, role === 'labour' && styles.labourBadge]}><Text style={styles.roleText}>{role.toUpperCase()}</Text></View>)}</View>
            <Text style={styles.memberSince}>Member since {new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
          </View>
        </View>

        {editingProfile && draft ? <>
          <View style={styles.formRow}>
            <Field label="First name" value={draft.firstName} onChangeText={(firstName) => setDraft({ ...draft, firstName })} />
            <Field label="Last name" value={draft.lastName} onChangeText={(lastName) => setDraft({ ...draft, lastName })} />
          </View>
          <AddressSelect label="Home address" value={draft.homeAddress} onPress={() => { void useCurrentLocation(); }} loading={locating} />
          <Field label="Email" value={draft.email ?? ''} onChangeText={(email) => setDraft({ ...draft, email })} keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.fieldLabel}>I am a</Text>
          <View style={styles.roleChoices}>
            {(['farmer', 'labour'] as const).map((role) => {
              const selected = draft.roles.includes(role);
              return <Pressable key={role} style={[styles.roleChoice, selected && styles.roleChoiceSelected]} onPress={() => setDraft({ ...draft, roles: selected ? draft.roles.filter((item) => item !== role) : [...draft.roles, role] })}>
                <Icon name={selected ? 'checkbox' : 'square-outline'} size={16} color={selected ? '#2563EB' : '#64748B'} /><Text style={styles.roleChoiceText}>{role === 'labour' ? 'Labour' : 'Farmer'}</Text>
              </Pressable>;
            })}
          </View>
          <View style={styles.formActions}>
            <Pressable style={styles.cancelButton} onPress={() => { setEditingProfile(false); setDraft(null); setSelectedImage(null); setError(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            <Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={saveProfile}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save details'}</Text></Pressable>
          </View>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </> : <>
          <View style={styles.divider} />
          <View style={styles.nameFields}><Detail label="First name" value={profile.firstName || 'Add your first name'} /><Detail label="Last name" value={profile.lastName || 'Add your last name'} /></View>
          <View style={styles.addressRow}><Icon name="home-outline" size={18} /><View style={styles.addressCopy}><Text style={styles.detailLabel}>Home address</Text><Text style={styles.detailValue}>{profile.homeAddress || 'Add your home address'}</Text>{!!profile.homeAddressMapLink && <Pressable onPress={() => { void openMap(profile.homeAddressMapLink); }}><Text style={styles.mapLinkText}>Open in Google Maps</Text></Pressable>}</View></View>
          <View style={styles.divider} />
          <View style={styles.contactRow}><View><Text style={styles.detailLabel}>Mobile number</Text><Text style={styles.detailValue}>{phone || profile.phone}</Text></View><View style={styles.verified}><Icon name="checkmark-circle" size={15} /><Text style={styles.verifiedText}>Verified</Text></View></View>
          <View style={styles.divider} />
          <View><Text style={styles.detailLabel}>{profile.email ? 'Email' : 'Email · Not added'}</Text><Text style={styles.detailValue}>{profile.email || 'Add your email address'}</Text></View>
        </>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeading}>Preferred language</Text>
        <Text style={styles.subtitle}>This preference is saved to your profile. Screen translations are being added in stages.</Text>
        <View style={styles.roleChoices}>
          {(['en', 'te'] as const).map((language) => <Pressable key={language} style={[styles.roleChoice, profile.preferredLanguage === language && styles.roleChoiceSelected]} disabled={saving} onPress={() => {
            if (profile.preferredLanguage === language) return;
            setSaving(true);
            setError('');
            void updateProfile(userId, { preferredLanguage: language }).then((updated) => {
              setProfile(updated);
              onProfileChange(updated);
            }).catch((saveError) => {
              setError(saveError instanceof Error ? saveError.message : 'Could not update your language preference.');
            }).finally(() => setSaving(false));
          }} accessibilityRole="radio" accessibilityState={{ selected: profile.preferredLanguage === language }}>
            <Text style={styles.roleChoiceText}>{language === 'en' ? 'English' : 'తెలుగు'}</Text>
          </Pressable>)}
        </View>
      </View>

      <View style={styles.activityHeader}><Text style={styles.sectionTitle}>Your activity</Text><Text style={styles.count}>All time</Text></View>
      <View style={styles.activityCard}><Icon name="information-circle-outline" size={18} color="#2563EB" /><Text style={styles.activityText}>Your work activity will appear here as you post requests and complete jobs.</Text></View>
      <View style={styles.privacy}><Icon name="lock-closed" size={16} color="#64748B" /><Text style={styles.privacyText}>Your contact details stay private.</Text></View>
    </>}

    <View style={styles.accountActions}>
      {!!signOutError && <Text style={styles.signOutError}>{signOutError}</Text>}
      <Pressable
        style={[styles.signOutButton, signingOut && styles.disabled]}
        onPress={() => setConfirmSignOut(true)}
        disabled={signingOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Icon name="log-out-outline" size={19} color="#0F172A" />
        <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
      </Pressable>
    </View>
    <Modal visible={confirmSignOut} transparent animationType="fade" onRequestClose={() => setConfirmSignOut(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Sign out?</Text>
          <Text style={styles.confirmCopy}>You can sign back in with your mobile number.</Text>
          <View style={styles.confirmActions}>
            <Pressable style={styles.cancelButton} onPress={() => setConfirmSignOut(false)} accessibilityRole="button"><Text style={styles.cancelText}>Stay signed in</Text></Pressable>
            <Pressable style={styles.confirmButton} onPress={() => { setConfirmSignOut(false); void signOut(); }} disabled={signingOut} accessibilityRole="button"><Text style={styles.confirmButtonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, autoCapitalize }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'email-address' | 'url';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><AppTextInput
    style={[styles.input, multiline && styles.multiline]}
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor="#64748B"
    multiline={multiline}
    keyboardType={keyboardType}
    autoCapitalize={autoCapitalize}
  /></View>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailBlock}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function AddressSelect({ label, value, onPress, loading }: { label: string; value: string; onPress: () => void; loading: boolean }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Pressable style={styles.addressSelect} onPress={onPress} disabled={loading} accessibilityRole="button">
      <Icon name="locate-outline" size={17} color="#2563EB" />
      <Text style={[styles.addressSelectText, !value && styles.addressPlaceholder]} numberOfLines={2}>{value || 'Use your current location'}</Text>
      <Text style={styles.imageUploadText}>{loading ? 'Locating…' : 'Use location'}</Text>
    </Pressable>
    <Text style={styles.addressHint}>Uses your device location to set your address and map pin.</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 26, paddingBottom: 36 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  heading: { color: '#0F172A', fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: '#64748B', fontSize: 14, marginTop: 4 },
  backButton: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  backText: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
  message: { color: '#64748B', fontSize: 14, marginVertical: 20 },
  errorBox: { backgroundColor: '#FFFFFF', borderColor: '#F0CACA', borderWidth: 1, padding: 16, borderRadius: 20, marginBottom: 14 },
  errorText: { color: '#9A4133', fontSize: 12, lineHeight: 18, marginTop: 6 },
  retry: { color: '#2563EB', fontSize: 13, fontWeight: '800', marginTop: 8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 18, shadowColor: '#213653', shadowOpacity: 0.04, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardHeading: { color: '#0F172A', fontSize: 17, fontWeight: '800' },
  editButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 },
  editText: { color: '#2563EB', fontSize: 13, fontWeight: '700' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#EFF6FF' },
  avatarFallback: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#2563EB', fontSize: 26, fontWeight: '800' },
  personInfo: { flex: 1 },
  personName: { color: '#0F172A', fontSize: 21, fontWeight: '800' },
  roles: { flexDirection: 'row', gap: 5, marginTop: 5 },
  roleBadge: { backgroundColor: '#EFF6FF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  labourBadge: { backgroundColor: '#EFF6FF' },
  roleText: { color: '#2563EB', fontSize: 10, fontWeight: '800' },
  memberSince: { color: '#64748B', fontSize: 11, marginTop: 6 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 },
  nameFields: { flexDirection: 'row', gap: 18 },
  detailBlock: { flex: 1, marginVertical: 2 },
  detailLabel: { color: '#64748B', fontSize: 12, marginBottom: 5 },
  detailValue: { color: '#0F172A', fontSize: 15, lineHeight: 21, fontWeight: '500' },
  addressRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  addressCopy: { flex: 1 },
  contactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { color: '#047857', fontSize: 11, fontWeight: '800' },
  field: { flex: 1, marginBottom: 10 },
  fieldLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 54, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, paddingHorizontal: 16, color: '#0F172A', backgroundColor: '#FFFFFF', fontSize: 16 },
  photoPicker: { width: 62, height: 62, position: 'relative' },
  photoPickerBadge: { position: 'absolute', right: -4, bottom: -4, width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  imageUploadText: { color: '#2563EB', fontSize: 13, fontWeight: '700' },
  multiline: { minHeight: 64, paddingTop: 9, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', gap: 10 },
  roleChoices: { flexDirection: 'row', gap: 10, marginBottom: 7 },
  roleChoice: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  roleChoiceSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  roleChoiceText: { color: '#0F172A', fontSize: 13, fontWeight: '600' },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 7 },
  cancelButton: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 24 },
  cancelText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  saveButton: { minHeight: 52, paddingHorizontal: 19, justifyContent: 'center', alignItems: 'center', borderRadius: 26, backgroundColor: '#2563EB' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 11 },
  sectionTitle: { color: '#0F172A', fontSize: 19, fontWeight: '800' },
  sectionSubtitle: { color: '#64748B', fontSize: 13, lineHeight: 18, marginTop: 5, maxWidth: 400 },
  count: { color: '#64748B', fontSize: 11, marginTop: 3 },
  farmCard: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14, shadowColor: '#213653', shadowOpacity: 0.04, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  farmHeader: { minHeight: 62, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  farmNameBlock: { flex: 1 },
  farmName: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  farmMeta: { color: '#64748B', fontSize: 12, marginTop: 4 },
  farmActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  savedBadge: { backgroundColor: '#ECFDF5', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  savedText: { color: '#047857', fontSize: 9, fontWeight: '800' },
  smallAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  mapPreview: { height: 142, overflow: 'hidden', backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  fieldTop: { position: 'absolute', top: 0, left: 0, width: '57%', height: '62%', backgroundColor: '#D6E4F8' },
  fieldBottom: { position: 'absolute', bottom: 0, right: 0, width: '52%', height: '52%', backgroundColor: '#D1E0F5' },
  roadOne: { position: 'absolute', left: -25, top: 66, width: '120%', height: 13, borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#D5DFEC', backgroundColor: '#F8FAFF', transform: [{ rotate: '-19deg' }] },
  roadTwo: { position: 'absolute', left: 24, top: 44, width: '110%', height: 10, borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#D5DFEC', backgroundColor: '#F8FAFF', transform: [{ rotate: '24deg' }] },
  roadThree: { position: 'absolute', left: '42%', top: -38, width: 10, height: 225, borderLeftWidth: 2, borderRightWidth: 2, borderColor: '#D5DFEC', backgroundColor: '#F8FAFF', transform: [{ rotate: '39deg' }] },
  mapArea: { position: 'absolute', top: 18, left: 22, color: '#64748B', fontSize: 11, fontWeight: '600' },
  mapRoad: { position: 'absolute', bottom: 8, left: 9, color: '#64748B', backgroundColor: '#FFFFFF', fontSize: 9, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#2563EB' },
  mapExpand: { position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  mapLink: { minHeight: 49, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapLinkCopy: { flex: 1 },
  farmAddress: { color: '#64748B', fontSize: 12 },
  mapLinkText: { color: '#2563EB', fontSize: 13, fontWeight: '800', marginTop: 3 },
  addLocation: { minHeight: 60, borderRadius: 30, backgroundColor: '#2563EB', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  addIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  addCopy: { flex: 1 },
  addTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  addSubtitle: { color: '#EFF6FF', fontSize: 11, marginTop: 3 },
  addPlus: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  activityCard: { minHeight: 68, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityText: { flex: 1, color: '#64748B', fontSize: 13, lineHeight: 19 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 16 },
  privacyText: { color: '#64748B', fontSize: 11 },
  accountActions: { alignItems: 'center', marginTop: 24, marginBottom: 12 },
  signOutButton: { minHeight: 56, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 28, backgroundColor: '#FFFFFF', paddingHorizontal: 18 },
  signOutText: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  signOutError: { color: '#A44E43', fontSize: 12, marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20, 32, 23, 0.48)', justifyContent: 'center', padding: 22 },
  confirmCard: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22 },
  confirmTitle: { color: '#0F172A', fontSize: 22, fontWeight: '800' },
  confirmCopy: { color: '#64748B', fontSize: 15, lineHeight: 21, marginTop: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 18 },
  confirmButton: { minHeight: 46, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 23, backgroundColor: '#B91C1C' },
  confirmButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  addressSelect: { minHeight: 54, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF' },
  addressSelectText: { flex: 1, color: '#0F172A', fontSize: 15 },
  addressPlaceholder: { color: '#64748B' },
  addressHint: { color: '#64748B', fontSize: 12, marginTop: 5 },
});
