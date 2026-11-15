import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { fetchProfile, ProfileDetails, updateProfile, uploadProfileImage, UserProfile } from '../api/profile';
import { reverseGeocodeLocation } from '../api/places';
import { BookingListItem, fetchBookings } from '../api/requests';
import { fetchSavedWorkers } from '../api/workers';
import { colors } from '../theme';

type Props = {
  userId: string;
  phone: string;
  onBack: () => void;
  onProfileChange: (profile: UserProfile) => void;
  onSignOut: () => Promise<void>;
  onOpenBookings: () => void;
  onOpenSavedWorkers: () => void;
};

type FarmerActivity = {
  bookings: number;
  workersHired: number;
  savedWorkers: number;
  recentBookings: Array<{ month: string; count: number }>;
};

function Icon({ name, size = 18, color = colors.primary }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function ProfileScreen({ userId, phone, onBack, onProfileChange, onSignOut, onOpenBookings, onOpenSavedWorkers }: Props) {
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
  const [languageOptionsOpen, setLanguageOptionsOpen] = useState(false);
  const [activity, setActivity] = useState<FarmerActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');

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

  useEffect(() => {
    let active = true;
    setActivity(null);
    setActivityLoading(true);
    setActivityError('');
    Promise.all([
      fetchBookings(userId, 'farmer', 'upcoming'),
      fetchBookings(userId, 'farmer', 'pending'),
      fetchBookings(userId, 'farmer', 'past'),
      fetchSavedWorkers(userId),
    ])
      .then(([upcoming, pending, past, savedWorkers]) => {
        if (active) setActivity(summarizeFarmerActivity(
          [upcoming, pending, past],
          savedWorkers.filter((worker) => worker.saved).length,
        ));
      })
      .catch((loadError) => {
        if (active) setActivityError(loadError instanceof Error
          ? `Could not load farmer activity: ${loadError.message}`
          : 'Could not load farmer activity.');
      })
      .finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [userId]);

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
  const firstFarm = profile?.farms[0];
  const farmAddress = firstFarm?.address || profile?.homeAddress || 'Add your farm location';
  const farmMapLink = firstFarm?.mapLink
    || (typeof firstFarm?.latitude === 'number' && typeof firstFarm.longitude === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${firstFarm.latitude},${firstFarm.longitude}`
      : null)
    || (!firstFarm ? profile?.homeAddressMapLink : null)
    || null;
  const maxMonthlyBookings = Math.max(0, ...(activity?.recentBookings.map((item) => item.count) ?? []));
  const avatarImageUrl = editingProfile && draft
    ? selectedImage?.uri ?? draft.profileImageUrl
    : profile?.profileImageUrl;
  const avatarContent = <View style={styles.avatarRing}>
    <LinearGradient colors={['#2563EB', '#38BDF8', '#4F46E5']} style={styles.avatarGradient}>
      <View style={styles.avatarInner}>
        {avatarImageUrl
          ? <Image source={{ uri: avatarImageUrl }} style={styles.avatarImage} />
          : <View style={styles.avatarFallback}><Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase() || 'F'}</Text></View>}
      </View>
    </LinearGradient>
    {editingProfile && <View style={styles.photoPickerBadge}><Icon name="camera" size={13} color="#FFFFFF" /></View>}
  </View>;

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <View style={styles.headingRow}>
      <Pressable onPress={onBack} style={styles.headerIconButton} accessibilityRole="button" accessibilityLabel="Go back">
        <Icon name="arrow-back" size={19} color={colors.text} />
      </Pressable>
      <Text style={styles.heading}>My profile</Text>
      {profile && <Pressable
        onPress={() => {
          if (editingProfile) {
            setEditingProfile(false);
            setDraft(null);
            setSelectedImage(null);
            setError('');
          } else {
            beginProfileEdit();
          }
        }}
        style={styles.headerIconButton}
        accessibilityRole="button"
        accessibilityLabel={editingProfile ? 'Cancel profile edit' : 'Edit profile'}
      >
        <Icon name={editingProfile ? 'close' : 'pencil'} size={18} />
      </Pressable>}
    </View>

    {loading && <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.message}>Loading your profile…</Text></View>}
    {!loading && error && !editingProfile && !profile && <View style={styles.errorBox}>
      <Text style={styles.errorText}>{error}</Text>
      {!profile && <Pressable onPress={() => {
        setLoading(true);
        fetchProfile(userId)
          .then((loaded) => { setProfile(loaded); onProfileChange(loaded); setError(''); })
          .catch(() => setError('Could not load your profile. Check your connection and try again.'))
          .finally(() => setLoading(false));
      }}><Text style={styles.retry}>Try again</Text></Pressable>}
    </View>}

    {!loading && profile && <>
      <View style={styles.heroCard}>
        {editingProfile
          ? <Pressable onPress={() => { void chooseProfileImage(); }} accessibilityRole="button" accessibilityLabel="Choose profile photo">{avatarContent}</Pressable>
          : avatarContent}
        <View style={styles.identityRow}>
          <Text style={styles.personName} numberOfLines={1}>{name || 'Your name'}</Text>
          <Icon name="checkmark-circle" size={18} />
        </View>
        <View style={styles.memberRow}>
          <View style={styles.roleBadge}><Text style={styles.roleText}>{profile.roles.includes('farmer') ? 'FARMER' : 'MEMBER'}</Text></View>
          <View style={styles.memberDot} />
          <Text style={styles.memberSince}>Member since {formatMemberSince(profile.createdAt)}</Text>
        </View>
        <FarmBanner name={firstFarm?.name || 'Farm location'} address={farmAddress} />
      </View>

      {editingProfile && draft ? <View style={styles.card}>
        <Text style={styles.cardHeading}>Edit profile</Text>
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
              <Icon name={selected ? 'checkbox' : 'square-outline'} size={16} color={selected ? colors.primary : colors.muted} />
              <Text style={styles.roleChoiceText}>{role === 'labour' ? 'Labour' : 'Farmer'}</Text>
            </Pressable>;
          })}
        </View>
        <View style={styles.formActions}>
          <Pressable style={styles.cancelButton} onPress={() => { setEditingProfile(false); setDraft(null); setSelectedImage(null); setError(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={saveProfile}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save details'}</Text></Pressable>
        </View>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </View> : <>
        <View style={styles.statsRow}>
          <StatCard icon="calendar-outline" label="Bookings" value={activityLoading ? '…' : activity ? String(activity.bookings) : '—'} onPress={onOpenBookings} />
          <StatCard icon="people-outline" label="Workers hired" value={activityLoading ? '…' : activity ? String(activity.workersHired) : '—'} onPress={onOpenBookings} />
          <StatCard icon="bookmark-outline" label="Saved" value={activityLoading ? '…' : activity ? String(activity.savedWorkers) : '—'} onPress={onOpenSavedWorkers} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.sectionHeading}><View style={styles.sectionMarker} /><Text style={styles.cardHeading}>Account Details</Text></View>
            <View style={styles.verifiedProfile}><View style={styles.verifiedDot} /><Text style={styles.verifiedProfileText}>Verified profile</Text></View>
          </View>
          <AccountRow icon="phone-portrait-outline" label="Mobile" value={phone || profile.phone} trailing={<View style={styles.verifiedBadge}><Icon name="checkmark-circle-outline" size={13} /><Text style={styles.verifiedBadgeText}>VERIFIED</Text></View>} />
          <AccountRow icon="mail-outline" label="Email" value={profile.email || 'Add your email address'} trailing={profile.email ? <Icon name="checkmark-circle" size={17} /> : null} />
          <Pressable
            style={styles.accountRow}
            onPress={() => farmMapLink ? void openMap(farmMapLink) : beginProfileEdit()}
            accessibilityRole="button"
            accessibilityLabel={farmMapLink ? 'Open farm location on map' : 'Add farm location'}
          >
            <View style={styles.accountIcon}><Icon name="location-outline" size={19} /></View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountLabel}>Farm location</Text>
              <View style={styles.locationValueRow}>
                <Text style={[styles.accountValue, styles.locationAddress]} numberOfLines={1}>{farmAddress}</Text>
                <View style={styles.memberDot} />
                <Text style={[styles.pinStatus, farmMapLink ? styles.pinSet : styles.pinNeeded]}>{farmMapLink ? 'pin set' : 'add pin'}</Text>
              </View>
            </View>
            <View style={styles.rowChevron}><Icon name={farmMapLink ? 'open-outline' : 'chevron-forward'} size={16} color={colors.muted} /></View>
          </Pressable>
          <Pressable
            style={[styles.accountRow, styles.lastAccountRow]}
            onPress={() => setLanguageOptionsOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Change language"
          >
            <View style={styles.accountIcon}><Icon name="globe-outline" size={19} /></View>
            <View style={styles.accountCopy}><Text style={styles.accountLabel}>Language</Text><Text style={styles.accountValue}>{profile.preferredLanguage === 'en' ? 'English' : 'తెలుగు'}</Text></View>
            <View style={styles.rowChevron}><Icon name={languageOptionsOpen ? 'chevron-up' : 'chevron-forward'} size={16} color={colors.muted} /></View>
          </Pressable>
          {languageOptionsOpen && <View style={styles.roleChoices}>
            {(['en', 'te'] as const).map((language) => <Pressable
              key={language}
              style={[styles.roleChoice, profile.preferredLanguage === language && styles.roleChoiceSelected, language === 'te' && styles.disabledLanguage]}
              disabled={saving || language === 'te'}
              onPress={() => {
                if (profile.preferredLanguage === language || language === 'te') return;
                setSaving(true);
                setError('');
                void updateProfile(userId, { preferredLanguage: language }).then((updated) => {
                  setProfile(updated);
                  onProfileChange(updated);
                  setLanguageOptionsOpen(false);
                }).catch((saveError) => {
                  setError(saveError instanceof Error ? saveError.message : 'Could not update your language preference.');
                }).finally(() => setSaving(false));
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: profile.preferredLanguage === language, disabled: language === 'te' || saving }}
            >
              <Text style={styles.roleChoiceText}>{language === 'en' ? 'English' : 'తెలుగు · Coming soon'}</Text>
            </Pressable>)}
          </View>}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <Pressable style={styles.workersCard} onPress={onOpenSavedWorkers} accessibilityRole="button" accessibilityLabel="Open my saved workers">
          <View style={styles.workersIcon}><Icon name="heart" size={20} color="#FFFFFF" /></View>
          <View style={styles.workersCopy}>
            <View style={styles.workersTitleRow}><Text style={styles.workersTitle}>My workers</Text><Text style={styles.savedCount}>{activityLoading ? '… saved' : `${activity?.savedWorkers ?? 0} saved`}</Text></View>
            <Text style={styles.workersSubtitle} numberOfLines={1}>Quick access to trusted farmhands and crews</Text>
          </View>
          <View style={styles.rowChevron}><Icon name="chevron-forward" size={17} color={colors.muted} /></View>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.trendHeading}><View style={styles.trendIcon}><Icon name="trending-up" size={16} /></View><Text style={styles.trendTitle}>Harvest Season Trend</Text></View>
            <Text style={styles.count}>Recent bookings</Text>
          </View>
          {!!activityError && <Text style={styles.errorText}>{activityError}</Text>}
          {activityLoading ? <View style={styles.activityLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.activityText}>Loading booking activity…</Text></View>
            : activity && activity.recentBookings.some((item) => item.count > 0) ? <View style={styles.chart}>
              {activity.recentBookings.map((item, index) => {
                const height = item.count === 0 ? 6 : Math.max(12, Math.round(item.count / maxMonthlyBookings * 56));
                return <View key={`${item.month}-${index}`} style={styles.chartColumn} accessibilityLabel={`${item.month}: ${item.count} bookings`}>
                  <View style={[styles.chartBar, { height }, index === activity.recentBookings.length - 1 && styles.chartBarCurrent]} />
                  <Text style={[styles.chartLabel, index === activity.recentBookings.length - 1 && styles.chartLabelCurrent]}>{item.month}</Text>
                </View>;
              })}
            </View> : <Text style={styles.activityText}>{activityError ? 'Booking activity is unavailable.' : 'Your booking trend will appear here as you hire workers.'}</Text>}
        </View>

        <View style={styles.privacy}>
          <View style={styles.privacyIcon}><Icon name="lock-closed" size={16} /></View>
          <Text style={styles.privacyText}>Your contact details stay private. Farmhands only view assigned schedules.</Text>
        </View>
      </>}
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
        <Icon name="log-out-outline" size={19} color={colors.danger} />
        <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Log out'}</Text>
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

function formatMemberSince(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'recently'
    : date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function summarizeFarmerActivity(buckets: BookingListItem[][], savedWorkers: number): FarmerActivity {
  const bookings = buckets.flat().filter((item): item is BookingListItem & {
    booking: NonNullable<BookingListItem['booking']>;
  } => item.type === 'booking' && item.booking !== undefined && item.booking.status !== 'cancelled');
  const recentBookings = Array.from({ length: 6 }, (_unused, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 5 + index);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return {
      month: date.toLocaleDateString('en-IN', { month: 'short' }),
      count: bookings.filter((item) => item.request.startDate.startsWith(monthKey)).length,
    };
  });
  return {
    bookings: bookings.length,
    workersHired: bookings.reduce((total, item) => total + (item.booking.peopleCount ?? 1), 0),
    savedWorkers,
    recentBookings,
  };
}

function StatCard({ icon, label, value, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return <Pressable style={styles.statCard} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
    <View style={styles.statIcon}><Icon name={icon} size={17} /></View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </Pressable>;
}

function AccountRow({ icon, label, value, trailing }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  trailing?: ReactNode;
}) {
  return <View style={styles.accountRow}>
    <View style={styles.accountIcon}><Icon name={icon} size={19} /></View>
    <View style={styles.accountCopy}><Text style={styles.accountLabel}>{label}</Text><Text style={styles.accountValue} numberOfLines={1}>{value}</Text></View>
    {trailing}
  </View>;
}

function FarmBanner({ name, address }: { name: string; address: string }) {
  return <View style={styles.farmBanner} accessibilityLabel={`${name}, ${address}`}>
    <LinearGradient colors={['#9CCB94', '#659A5C', '#315E3B']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFillObject} />
    <View style={styles.farmSun} />
    <View style={styles.farmHillBack} />
    <View style={styles.farmHillFront} />
    <View style={styles.farmRowOne} />
    <View style={styles.farmRowTwo} />
    <LinearGradient colors={['transparent', 'rgba(15, 23, 42, 0.78)']} locations={[0, 1]} style={styles.farmShade} />
    <View style={styles.farmBannerLabel}>
      <Icon name="leaf" size={15} color="#A7F3D0" />
      <View style={styles.farmBannerCopy}>
        <Text style={styles.farmBannerName} numberOfLines={1}>{name}</Text>
        <Text style={styles.farmBannerAddress} numberOfLines={1}>{address}</Text>
      </View>
    </View>
  </View>;
}

function AddressSelect({ label, value, onPress, loading }: { label: string; value: string; onPress: () => void; loading: boolean }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Pressable style={styles.addressSelect} onPress={onPress} disabled={loading} accessibilityRole="button">
      <Icon name="locate-outline" size={17} />
      <Text style={[styles.addressSelectText, !value && styles.addressPlaceholder]} numberOfLines={2}>{value || 'Use your current location'}</Text>
      <Text style={styles.addressActionText}>{loading ? 'Locating…' : 'Use location'}</Text>
    </Pressable>
    <Text style={styles.addressHint}>Uses your device location to set your address and map pin.</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.screenTop },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  headingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heading: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  headerIconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: colors.text, shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  loadingState: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 22 },
  message: { color: colors.muted, fontSize: 14 },
  errorBox: { backgroundColor: colors.surface, borderColor: '#FECACA', borderWidth: 1, padding: 14, borderRadius: 18, marginBottom: 14 },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 6 },
  retry: { color: colors.primary, fontSize: 13, fontWeight: '800', marginTop: 8 },
  heroCard: { position: 'relative', overflow: 'hidden', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 28, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 14, shadowColor: colors.primary, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  avatarRing: { width: 96, height: 96, marginTop: 2, marginBottom: 13, position: 'relative' },
  avatarGradient: { width: 96, height: 96, padding: 4, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: 88, height: 88, borderRadius: 44, overflow: 'hidden', borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  avatarLetter: { color: colors.primary, fontSize: 29, fontWeight: '800' },
  photoPickerBadge: { position: 'absolute', right: 1, bottom: 1, width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  identityRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  personName: { maxWidth: '88%', color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7, marginBottom: 16 },
  roleBadge: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  roleText: { color: colors.primary, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  memberDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1' },
  memberSince: { color: colors.muted, fontSize: 11 },
  farmBanner: { width: '100%', height: 104, position: 'relative', overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  farmSun: { position: 'absolute', top: 12, right: 42, width: 23, height: 23, borderRadius: 12, backgroundColor: '#FDE68A', opacity: 0.95 },
  farmHillBack: { position: 'absolute', top: 35, left: -18, width: '115%', height: 54, borderRadius: 50, backgroundColor: '#79A866', transform: [{ rotate: '-3deg' }] },
  farmHillFront: { position: 'absolute', bottom: -17, left: -16, width: '118%', height: 64, borderRadius: 60, backgroundColor: '#3D7544', transform: [{ rotate: '3deg' }] },
  farmRowOne: { position: 'absolute', left: '16%', bottom: 4, width: '92%', height: 38, borderTopWidth: 2, borderColor: 'rgba(192, 220, 142, 0.8)', transform: [{ rotate: '-12deg' }] },
  farmRowTwo: { position: 'absolute', left: '26%', bottom: -9, width: '90%', height: 39, borderTopWidth: 2, borderColor: 'rgba(192, 220, 142, 0.65)', transform: [{ rotate: '-12deg' }] },
  farmShade: { ...StyleSheet.absoluteFillObject },
  farmBannerLabel: { position: 'absolute', left: 12, right: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  farmBannerCopy: { flex: 1 },
  farmBannerName: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  farmBannerAddress: { color: '#E2E8F0', fontSize: 10, marginTop: 1 },
  card: { backgroundColor: colors.surface, borderRadius: 25, padding: 15, borderWidth: 1, borderColor: colors.border, marginBottom: 14, shadowColor: colors.text, shadowOpacity: 0.035, shadowRadius: 14, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  cardHeading: { color: colors.text, fontSize: 14, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionMarker: { width: 6, height: 16, borderRadius: 4, backgroundColor: colors.primary },
  verifiedProfile: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifiedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  verifiedProfileText: { color: colors.primary, fontSize: 10, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  statCard: { flex: 1, minWidth: 0, minHeight: 118, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 11, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: colors.text, shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  statIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.primarySoft, marginBottom: 5 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 1 },
  accountRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, marginTop: 8, borderRadius: 17, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' },
  lastAccountRow: { marginBottom: 1 },
  accountIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  accountCopy: { flex: 1, minWidth: 0 },
  accountLabel: { color: '#94A3B8', fontSize: 10, marginBottom: 2 },
  accountValue: { flexShrink: 1, color: colors.text, fontSize: 12, fontWeight: '600' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: colors.primarySoft },
  verifiedBadgeText: { color: colors.primary, fontSize: 8, fontWeight: '700' },
  locationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  locationAddress: { flex: 1 },
  pinStatus: { fontSize: 9, fontWeight: '600' },
  pinSet: { color: colors.primary },
  pinNeeded: { color: colors.warning },
  rowChevron: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  roleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9, marginBottom: 4 },
  roleChoice: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  roleChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  disabledLanguage: { opacity: 0.55 },
  roleChoiceText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  workersCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginBottom: 14, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: colors.text, shadowOpacity: 0.03, shadowRadius: 9, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  workersIcon: { width: 41, height: 41, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  workersCopy: { flex: 1, minWidth: 0 },
  workersTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workersTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  savedCount: { color: colors.primary, fontSize: 9, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: colors.primarySoft },
  workersSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  trendHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trendIcon: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.primarySoft },
  trendTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  count: { color: colors.muted, fontSize: 9 },
  chart: { height: 86, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingTop: 6, paddingHorizontal: 2 },
  chartColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  chartBar: { width: '100%', maxWidth: 38, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: '#E2E8F0' },
  chartBarCurrent: { backgroundColor: colors.primary },
  chartLabel: { color: '#94A3B8', fontSize: 9 },
  chartLabelCurrent: { color: colors.primary, fontWeight: '700' },
  activityLoading: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityText: { color: colors.muted, fontSize: 11, lineHeight: 17, paddingVertical: 8 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 1, borderRadius: 17, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF' },
  privacyIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: colors.surface },
  privacyText: { flex: 1, color: '#475569', fontSize: 10, lineHeight: 15 },
  field: { flex: 1, marginBottom: 10 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 17, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.surface, fontSize: 15 },
  multiline: { minHeight: 64, paddingTop: 9, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  addressSelect: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface },
  addressSelectText: { flex: 1, color: colors.text, fontSize: 13 },
  addressPlaceholder: { color: colors.muted },
  addressActionText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  addressHint: { color: colors.muted, fontSize: 11, marginTop: 5 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  cancelButton: { minHeight: 46, paddingHorizontal: 15, justifyContent: 'center', borderRadius: 23 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  saveButton: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 24, backgroundColor: colors.primary },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  accountActions: { alignItems: 'center', marginTop: 18, marginBottom: 8 },
  signOutButton: { minHeight: 54, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: '#FECDD3', borderRadius: 19, backgroundColor: colors.surface, paddingHorizontal: 18 },
  signOutText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  signOutError: { color: colors.danger, fontSize: 12, marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.48)', justifyContent: 'center', padding: 22 },
  confirmCard: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 24, padding: 22 },
  confirmTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  confirmCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 18 },
  confirmButton: { minHeight: 46, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 23, backgroundColor: colors.danger },
  confirmButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
