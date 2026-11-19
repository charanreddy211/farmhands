import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { ProfileDetails, updateProfile, uploadProfileImage, UserProfile } from '../api/profile';
import { fetchWorkerRequests } from '../api/requests';
import { fetchLabourGroup } from '../api/groups';
import { colors } from '../theme';

type Screen = 'home' | 'skills' | 'availability' | 'profile';
type Props = {
  userId: string;
  profile: UserProfile;
  initialScreen?: Screen;
  onProfileChange: (profile: UserProfile) => void;
  onOpenRequests: () => void;
  onOpenGroup: () => void;
  onSignOut: () => Promise<void>;
};

function Icon({ name, size = 20, color = colors.text }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function canSetSameDayAvailability(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now));
  return hour < 7;
}

function isAvailabilityDateCurrent(key: string, now: Date): boolean {
  const today = dateKey(now);
  return key > today || (key === today && canSetSameDayAvailability(now));
}

function isProfileComplete(profile: UserProfile): boolean {
  return Boolean(
    profile.firstName.trim()
    && profile.labourArea.trim()
    && profile.labourSkills.length
    && profile.labourDailyRate
    && profile.labourTravelRadius,
  );
}

export default function LabourExperienceScreen({ userId, profile, initialScreen, onProfileChange, onOpenRequests, onOpenGroup, onSignOut }: Props) {
  const firstScreen = profile.onboardingComplete && isProfileComplete(profile) ? initialScreen ?? 'home' : 'setup';
  const [screen, setScreen] = useState<Screen | 'setup'>(firstScreen);
  const screenHistory = useRef<Array<Screen | 'setup'>>([]);
  const [name, setName] = useState(`${profile.firstName} ${profile.lastName}`.trim());
  const [area, setArea] = useState(profile.labourArea);
  const [rate, setRate] = useState(profile.labourDailyRate?.toString() ?? '');
  const [travelRadius, setTravelRadius] = useState(profile.labourTravelRadius?.toString() ?? '');
  const [locationCoordinates, setLocationCoordinates] = useState<{ latitude: number; longitude: number } | null>(() =>
    profile.labourLatitude !== null && profile.labourLongitude !== null
      ? { latitude: profile.labourLatitude, longitude: profile.labourLongitude }
      : null);
  const [locationSaved, setLocationSaved] = useState(profile.labourLocationSet);
  const [locationDirty, setLocationDirty] = useState(false);
  const [locating, setLocating] = useState(false);
  const [skills, setSkills] = useState(profile.labourSkills);
  const [newSkill, setNewSkill] = useState('');
  const [selectedDates, setSelectedDates] = useState(() => new Set(profile.labourAvailableDates.filter((date) => isAvailabilityDateCurrent(date, new Date()))));
  const [availabilityPeopleByDate, setAvailabilityPeopleByDate] = useState(() => profile.labourAvailablePeopleByDate ?? {});
  const [availabilityChoiceDate, setAvailabilityChoiceDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [bookedDates, setBookedDates] = useState<Set<string>>(() => new Set());
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState('');
  const [groupCapacity, setGroupCapacity] = useState(1);
  const [groupMemberNames, setGroupMemberNames] = useState<string[]>([]);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState('');
  const [newRequestCount, setNewRequestCount] = useState(0);
  const [requestCountError, setRequestCountError] = useState('');
  const [requestCountRetry, setRequestCountRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [profileImageSaving, setProfileImageSaving] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  function navigateScreen(nextScreen: Screen | 'setup') {
    if (nextScreen === screen) return;
    screenHistory.current.push(screen);
    setScreen(nextScreen);
  }

  function goBack() {
    setScreen(screenHistory.current.pop() ?? 'home');
  }

  function goHome() {
    screenHistory.current = [];
    setScreen('home');
  }
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [error, setError] = useState('');
  function availabilityCapacity(date: string): number {
    const savedCapacity = availabilityPeopleByDate[date];
    if (typeof savedCapacity === 'number' && Number.isInteger(savedCapacity) && savedCapacity >= 1) return savedCapacity;
    return selectedDates.has(date) ? 1 : groupCapacity;
  }

  useEffect(() => {
    const updateTime = () => {
      const currentTime = new Date();
      setNow(currentTime);
      setSelectedDates((current) => {
        const next = [...current].filter((date) => isAvailabilityDateCurrent(date, currentTime));
        return next.length === current.size ? current : new Set(next);
      });
    };
    const interval = setInterval(updateTime, 30000);
    const subscription = AppState.addEventListener('change', updateTime);
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  async function refreshBookedDates() {
    setBookingsLoading(true);
    setBookingsError('');
    try {
      const requests = await fetchWorkerRequests(userId, 'accepted');
      const nextBookedDates = new Set<string>();
      for (const item of requests) {
        if (item.bookingStatus !== 'confirmed') continue;
        const end = new Date(`${item.request.endDate.slice(0, 10)}T00:00:00`);
        for (const date = new Date(`${item.request.startDate.slice(0, 10)}T00:00:00`); date <= end; date.setDate(date.getDate() + 1)) {
          nextBookedDates.add(dateKey(date));
        }
      }
      setBookedDates(nextBookedDates);
    } catch (loadError) {
      setBookingsError(loadError instanceof Error ? loadError.message : 'Could not load your confirmed bookings.');
    } finally {
      setBookingsLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    fetchLabourGroup(userId)
      .then((group) => {
        if (active) {
          setGroupCapacity(group?.size ?? 1);
          setGroupMemberNames(group?.memberNames ?? []);
          setGroupError('');
        }
      })
      .catch((loadError) => {
        if (active) setGroupError(loadError instanceof Error ? loadError.message : 'Could not load your available group size.');
      })
      .finally(() => { if (active) setGroupLoading(false); });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await refreshBookedDates();
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId]);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refreshNewRequestCount = async () => {
      if (!active || refreshing || AppState.currentState !== 'active') return;
      refreshing = true;
      try {
        const newRequests = await fetchWorkerRequests(userId, 'new');
        if (active) {
          setNewRequestCount(newRequests.length);
          setRequestCountError('');
        }
      } catch (requestError) {
        if (active) {
          setRequestCountError(requestError instanceof Error
            ? `Could not check new requests: ${requestError.message}`
            : 'Could not check new requests.');
        }
      } finally {
        refreshing = false;
      }
    };
    void refreshNewRequestCount();
    const interval = setInterval(() => { void refreshNewRequestCount(); }, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshNewRequestCount();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId, requestCountRetry]);
  const weekDates = useMemo(() => {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + index);
      return date;
    });
  }, [now]);
  const weeklyAvailableCount = weekDates.filter((date) => {
    const key = dateKey(date);
    return key >= dateKey(now)
      && selectedDates.has(key)
      && !bookedDates.has(key)
      && (key !== dateKey(now) || canSetSameDayAvailability(now));
  }).length;
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const dayCount = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    return [
      ...Array.from({ length: mondayOffset }, () => null),
      ...Array.from({ length: dayCount }, (_, index) => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1)),
    ];
  }, [calendarMonth]);

  async function saveProfile(input: Partial<ProfileDetails>, nextScreen?: Screen | 'setup') {
    setSaving(true);
    setError('');
    try {
      const saved = await updateProfile(userId, input);
      onProfileChange(saved);
      setName(`${saved.firstName} ${saved.lastName}`.trim());
      setArea(saved.labourArea);
      setRate(saved.labourDailyRate?.toString() ?? '');
      setTravelRadius(saved.labourTravelRadius?.toString() ?? '');
      const changedLocation = Object.prototype.hasOwnProperty.call(input, 'labourLatitude');
      if (changedLocation) {
        setLocationCoordinates(input.labourLatitude !== null && input.labourLatitude !== undefined
          && input.labourLongitude !== null && input.labourLongitude !== undefined
          ? { latitude: input.labourLatitude, longitude: input.labourLongitude }
          : null);
        setLocationSaved(saved.labourLocationSet);
        setLocationDirty(false);
      }
      setSkills(saved.labourSkills);
      setSelectedDates(new Set(saved.labourAvailableDates.filter((date) => isAvailabilityDateCurrent(date, now))));
      setAvailabilityPeopleByDate(saved.labourAvailablePeopleByDate ?? {});
      if (nextScreen) {
        if (screenHistory.current[screenHistory.current.length - 1] === nextScreen) screenHistory.current.pop();
        if (nextScreen === 'home') screenHistory.current = [];
        setScreen(nextScreen);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your worker profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function captureWorkLocation() {
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Allow location access to appear in nearby worker searches.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationCoordinates({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      setLocationDirty(true);
      setLocationSaved(false);
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Could not get your work location. Please try again.');
    } finally {
      setLocating(false);
    }
  }

  async function saveSetup() {
    const trimmedName = name.trim();
    const nameParts = trimmedName.split(/\s+/);
    const firstName = nameParts.shift() ?? '';
    const lastName = nameParts.join(' ') || profile.lastName;
    const dailyRate = Number(rate);
    const radius = Number(travelRadius);

    if (!firstName || !area.trim() || !skills.length) {
      setError('Add your name, village, and at least one skill to continue.');
      return;
    }
    if (firstName.length > 80 || lastName.length > 80 || area.trim().length > 120) {
      setError('Keep your name under 80 characters and village under 120 characters.');
      return;
    }
    if (!Number.isInteger(dailyRate) || dailyRate < 1 || dailyRate > 100000 || !Number.isInteger(radius) || radius < 1 || radius > 500) {
      setError('Enter a valid daily rate and travel distance.');
      return;
    }

    await saveProfile({
      firstName,
      ...(lastName ? { lastName } : {}),
      roles: profile.roles.includes('labour') ? profile.roles : [...profile.roles, 'labour'],
      onboardingComplete: true,
      labourSkills: skills,
      labourArea: area.trim(),
      labourDailyRate: dailyRate,
      labourTravelRadius: radius,
      ...(locationDirty ? {
        labourLatitude: locationCoordinates?.latitude ?? null,
        labourLongitude: locationCoordinates?.longitude ?? null,
      } : {}),
    }, 'home');
  }

  async function saveSkills() {
    if (!skills.length) {
      setError('Choose at least one skill before saving.');
      return;
    }
    await saveProfile({ labourSkills: skills }, 'profile');
  }

  function addSkill() {
    const skill = newSkill.trim();
    if (!skill) return;
    if (skills.some((item) => item.toLocaleLowerCase() === skill.toLocaleLowerCase())) {
      setError('That skill is already added.');
      return;
    }
    if (skills.length >= 20) {
      setError('You can add up to 20 skills.');
      return;
    }
    if (skill.length > 40) {
      setError('Keep each skill under 40 characters.');
      return;
    }
    setSkills((current) => [...current, skill]);
    setNewSkill('');
    setError('');
  }

  function openAvailabilityChoice(date: Date) {
    const key = dateKey(date);
    if (!isAvailabilityDateCurrent(key, now) || bookedDates.has(key) || bookingsLoading || bookingsError) return;
    const isAvailable = selectedDates.has(key);
    if (!isAvailable && selectedDates.size >= 366) {
      setError('You can set availability for up to 366 dates.');
      return;
    }
    if (key === dateKey(now) && !canSetSameDayAvailability(now)) {
      setError('Same-day availability closes at 7:00 a.m. India time.');
      return;
    }
    setError('');
    setAvailabilityChoiceDate(key);
  }

  function chooseAvailability(capacity: number | null) {
    if (!availabilityChoiceDate) return;
    const nextDates = new Set(selectedDates);
    const nextCapacities = { ...availabilityPeopleByDate };
    if (capacity === null) {
      nextDates.delete(availabilityChoiceDate);
      delete nextCapacities[availabilityChoiceDate];
    } else {
      nextDates.add(availabilityChoiceDate);
      nextCapacities[availabilityChoiceDate] = capacity;
    }
    setAvailabilityChoiceDate(null);
    if (screen === 'home') {
      const today = dateKey(now);
      void saveProfile({
        labourAvailableDates: [...nextDates].sort(),
        labourAvailablePeopleByDate: Object.fromEntries([...nextDates].map((date) => [date, nextCapacities[date] ?? 1])),
        labourAvailable: canSetSameDayAvailability(now) && nextDates.has(today) && !bookedDates.has(today),
      });
      return;
    }
    setSelectedDates(nextDates);
    setAvailabilityPeopleByDate(nextCapacities);
  }

  async function saveAvailability() {
    const today = dateKey(now);
    const dates = [...selectedDates].filter((date) => isAvailabilityDateCurrent(date, now)).sort();
    await saveProfile({
      labourAvailableDates: dates,
      labourAvailablePeopleByDate: Object.fromEntries(dates.map((date) => [date, availabilityPeopleByDate[date] ?? 1])),
      labourAvailable: canSetSameDayAvailability(now) && selectedDates.has(today) && !bookedDates.has(today),
    }, 'home');
  }

  async function reloadGroupSize() {
    setGroupLoading(true);
    setGroupError('');
    try {
      const group = await fetchLabourGroup(userId);
      setGroupCapacity(group?.size ?? 1);
      setGroupMemberNames(group?.memberNames ?? []);
    } catch (loadError) {
      setGroupError(loadError instanceof Error ? loadError.message : 'Could not load your available group size.');
    } finally {
      setGroupLoading(false);
    }
  }

  function toggleWeekday(date: Date) {
    const key = dateKey(date);
    if (bookingsLoading || bookingsError || bookedDates.has(key)) return;
    if (!isAvailabilityDateCurrent(key, now)) return;
    if (key === dateKey(now) && !canSetSameDayAvailability(now)) {
      setError('Same-day availability closes at 7:00 a.m. India time.');
      return;
    }
    openAvailabilityChoice(date);
  }

  async function updateShift(shift: 'morning' | 'full_day') {
    if (shift === profile.labourShift || saving) return;
    await saveProfile({ labourShift: shift });
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
      if (result.canceled) return;

      setProfileImageSaving(true);
      const profileImageUrl = await uploadProfileImage(userId, result.assets[0]);
      const updated = await updateProfile(userId, { profileImageUrl });
      onProfileChange(updated);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Could not save your profile photo. Please try again.');
    } finally {
      setProfileImageSaving(false);
    }
  }

  async function savePreferredLanguage(language: 'en' | 'te') {
    if (language === 'te' || language === profile.preferredLanguage || saving) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateProfile(userId, { preferredLanguage: language });
      onProfileChange(updated);
      setLanguagePickerOpen(false);
    } catch (languageError) {
      setError(languageError instanceof Error ? languageError.message : 'Could not update your language preference.');
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    setError('');
    try {
      await onSignOut();
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const title = screen === 'setup'
    ? 'Set up your profile'
    : screen === 'skills'
      ? 'Edit skills'
      : screen === 'availability'
        ? 'My availability'
        : screen === 'profile'
          ? 'My profile'
          : 'Ready to work?';
  const todayAvailable = canSetSameDayAvailability(now) && profile.labourAvailable;
  const subtitle = screen === 'home'
    ? 'పని చేయడానికి సిద్ధమా?'
    : screen === 'availability'
      ? 'నా పని లభ్యత'
      : screen === 'skills'
        ? 'నా పని నైపుణ్యాలు'
        : 'మీ పని, మీ ఇష్టం.';
  const profileInitials = `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase() || 'F';

  return <View style={styles.page}>
    {screen === 'profile' && <View style={styles.profileAppHeader}>
      <View style={styles.profileBrand}>
        <View style={styles.profileBrandIcon}><Icon name="leaf-outline" size={20} color={colors.primary} /></View>
        <View>
          <Text style={styles.profileBrandName}>Farmhands</Text>
          <Text style={styles.profileBrandSubtitle}>Profile &amp; Account</Text>
        </View>
      </View>
      <Pressable style={styles.profileNotification} onPress={onOpenRequests} accessibilityRole="button" accessibilityLabel="Open work requests">
        <Icon name="notifications-outline" size={20} color={colors.muted} />
        {newRequestCount > 0 && <View style={styles.requestBadge}><Text style={styles.requestBadgeText}>{newRequestCount > 9 ? '9+' : newRequestCount}</Text></View>}
      </Pressable>
      <View style={styles.profileHeaderAvatar}>
        {profile.profileImageUrl
          ? <Image source={{ uri: profile.profileImageUrl }} style={styles.profileHeaderAvatarImage} />
          : <Text style={styles.profileHeaderAvatarText}>{profileInitials}</Text>}
      </View>
    </View>}
    <ScrollView contentContainerStyle={[styles.content, screen === 'profile' && styles.profileContent]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {screen === 'profile' ? <View style={styles.profileHeadingRow}>
        <Pressable style={styles.profileHeaderButton} onPress={goBack} accessibilityRole="button" accessibilityLabel="Back to worker home">
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.profilePageHeading}>My profile</Text>
        <Pressable style={styles.profileHeaderButton} onPress={() => navigateScreen('setup')} accessibilityRole="button" accessibilityLabel="Edit work profile">
          <Icon name="options-outline" size={20} color={colors.primary} />
        </Pressable>
      </View> : <View style={styles.headingRow}>
        {screen !== 'home' && (screen !== 'setup' || screenHistory.current.length > 0) && <Pressable
          style={styles.profileBackButton}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${screenHistory.current[screenHistory.current.length - 1] ?? 'worker home'}`}
        >
          <Icon name="chevron-back" size={22} color={colors.primary} />
        </Pressable>}
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>{screen === 'home' ? <>Ready to <Text style={styles.headingAccent}>work?</Text></> : title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>}
      {screen === 'home' && !!requestCountError && <View style={styles.requestCountError}>
        <Text style={styles.requestCountErrorText} accessibilityRole="alert">{requestCountError}</Text>
        <Pressable onPress={() => setRequestCountRetry((attempt) => attempt + 1)} accessibilityRole="button" accessibilityLabel="Retry checking new requests">
          <Icon name="refresh-outline" size={18} color={colors.danger} />
        </Pressable>
      </View>}

      {screen === 'setup' && <>
        <Text style={styles.pageTitle}>Your work profile</Text>
        <Text style={styles.pageSubtitle}>Help nearby farmers find you.</Text>
        <Field label="Your name" value={name} onChangeText={setName} placeholder="Enter your name" />
        <Field label="Work you do" value={newSkill} onChangeText={setNewSkill} placeholder="Add a skill, such as harvesting" onSubmitEditing={addSkill} />
        <Pressable style={styles.secondaryButton} onPress={addSkill} accessibilityRole="button">
          <Icon name="add" size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Add skill</Text>
        </Pressable>
        <SkillChips skills={skills} onRemove={(skill) => setSkills((current) => current.filter((item) => item !== skill))} />
        <Field label="Village" value={area} onChangeText={(value) => { setArea(value); setLocationCoordinates(null); setLocationDirty(true); setLocationSaved(false); }} placeholder="Village or taluk" />
        <Pressable style={styles.secondaryButton} onPress={() => { void captureWorkLocation(); }} disabled={locating} accessibilityRole="button">
          {locating ? <ActivityIndicator color={colors.primary} /> : <Icon name="location-outline" size={18} color={colors.primary} />}
          <Text style={styles.secondaryButtonText}>{locating ? 'Finding location…' : locationCoordinates ? 'GPS location selected for nearby search' : locationSaved ? 'GPS location saved for nearby search' : 'Use GPS for nearby search'}</Text>
        </Pressable>
        <Field label="How far can you travel? (km)" value={travelRadius} onChangeText={setTravelRadius} placeholder="Enter distance in km" keyboardType="number-pad" />
        <Field label="Your daily rate (₹ per day)" value={rate} onChangeText={setRate} placeholder="Enter your rate" keyboardType="number-pad" />
      </>}

      {screen === 'skills' && <>
        <Text style={styles.pageTitle}>What work can you do?</Text>
        <Text style={styles.pageSubtitle}>Add the skills farmers should find you for.</Text>
        <Field label="Add a skill" value={newSkill} onChangeText={setNewSkill} placeholder="For example, harvesting" onSubmitEditing={addSkill} />
        <Pressable style={styles.secondaryButton} onPress={addSkill} accessibilityRole="button">
          <Icon name="add" size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Add skill</Text>
        </Pressable>
        <SkillChips skills={skills} onRemove={(skill) => setSkills((current) => current.filter((item) => item !== skill))} />
        <View style={styles.infoCard}>
          <Text style={styles.cardHeading}>Daily rate</Text>
          <Text style={styles.cardText}>{profile.labourDailyRate ? `₹${profile.labourDailyRate} per day` : 'Not set yet'}</Text>
        </View>
      </>}

      {screen === 'availability' && <>
        <View style={styles.calendarDetails}>
          <Text style={styles.cardText}>
            {bookingsLoading
              ? 'Loading your confirmed bookings…'
              : bookingsError
                ? `Could not load booking details: ${bookingsError}`
                : groupLoading
                  ? 'Loading your available group size…'
                  : groupError
                    ? `Could not load your group availability: ${groupError}`
                    : 'Choose who is available for each date. You can change the choice or mark an available date unavailable. Booked and expired dates are locked.'}
          </Text>
          {!!bookingsError && <Pressable onPress={() => { void refreshBookedDates(); }} accessibilityRole="button">
            <Text style={styles.calendarLink}>Retry</Text>
          </Pressable>}
          {!!groupError && <Pressable onPress={() => { void reloadGroupSize(); }} disabled={groupLoading} accessibilityRole="button">
            <Text style={styles.calendarLink}>Retry group size</Text>
          </Pressable>}
          {!canSetSameDayAvailability(now) && <Text style={styles.cutoffNote}>Same-day availability closes at 7:00 a.m. India time.</Text>}
        </View>
        <View style={styles.monthHeader}>
          <Text style={styles.monthTitle}>{calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
          <View style={styles.monthControls}>
            <MonthButton label="Previous month" icon="chevron-back" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
            <MonthButton label="Next month" icon="chevron-forward" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
          </View>
        </View>
        <View style={styles.calendarGrid}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}
          {calendarDays.map((date, index) => {
            if (!date) return <View key={`empty-${index}`} style={styles.calendarCell} />;
            const key = dateKey(date);
            const booked = bookedDates.has(key);
            const sameDayClosed = key === dateKey(now) && !canSetSameDayAvailability(now);
            const available = selectedDates.has(key) && isAvailabilityDateCurrent(key, now) && !booked;
            const capacity = availabilityCapacity(key);
            const past = key < dateKey(new Date());
            const disabled = past || booked || sameDayClosed || bookingsLoading || !!bookingsError || groupLoading || saving;
            return <Pressable
              key={key}
              style={[styles.calendarCell, available && styles.calendarDayAvailable, booked && styles.calendarDayBooked, disabled && styles.calendarDayPast]}
              onPress={() => openAvailabilityChoice(date)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${date.toLocaleDateString('en-IN', { dateStyle: 'full' })}${booked ? ', booked' : available ? `, ${capacity} ${capacity === 1 ? 'person' : 'people'} free` : ''}`}
              accessibilityHint={booked ? 'This date is booked and cannot be changed.' : available ? 'Select to change who is available or mark unavailable.' : 'Select to choose who is available.'}
              accessibilityState={{ selected: available, disabled }}
            >
              <Text style={[styles.calendarDayText, available && styles.calendarDayTextAvailable, booked && styles.calendarDayTextBooked, disabled && styles.calendarDayTextPast]}>{date.getDate()}</Text>
              {available && !groupLoading && !groupError && <Text style={styles.calendarDayCapacity}>{capacity} free</Text>}
            </Pressable>;
          })}
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={styles.legendFree} /><Text style={styles.cardText}>Available</Text></View>
          <View style={styles.legendItem}><View style={styles.legendBooked} /><Text style={styles.cardText}>Booked</Text></View>
          <View style={styles.legendItem}><View style={styles.legendUnavailable} /><Text style={styles.cardText}>Not available</Text></View>
        </View>
        <View style={styles.quickActions}>
          <Pressable style={styles.outlineChip} onPress={() => {
            const next = new Set(selectedDates);
            const nextCapacities = { ...availabilityPeopleByDate };
            const year = calendarMonth.getFullYear();
            const month = calendarMonth.getMonth();
            const dayCount = new Date(year, month + 1, 0).getDate();
            for (let day = 1; day <= dayCount; day += 1) {
              const date = new Date(year, month, day);
              const key = dateKey(date);
              if (date.getDay() !== 0 && date.getDay() !== 6 && key >= dateKey(now) && !bookedDates.has(key)
                && (key !== dateKey(now) || canSetSameDayAvailability(now))) {
                next.add(key);
                if (!nextCapacities[key]) nextCapacities[key] = groupCapacity;
              }
            }
            if (next.size > 366) {
              setError('You can set availability for up to 366 dates.');
              return;
            }
            setError('');
            setSelectedDates(next);
            setAvailabilityPeopleByDate(nextCapacities);
          }} disabled={bookingsLoading || !!bookingsError || groupLoading} accessibilityRole="button"><Text style={styles.outlineChipText}>Every weekday</Text></Pressable>
          <Pressable style={styles.outlineChip} onPress={() => {
            const nextDates = new Set([...selectedDates].filter((date) => isAvailabilityDateCurrent(date, now) && bookedDates.has(date)));
            setSelectedDates(nextDates);
            setAvailabilityPeopleByDate(Object.fromEntries([...nextDates].map((date) => [date, availabilityPeopleByDate[date] ?? 1])));
            setError('');
          }} disabled={bookingsLoading || !!bookingsError} accessibilityRole="button"><Text style={styles.outlineChipText}>Clear all</Text></Pressable>
        </View>
        <Text style={styles.helperText}>Tap a date. Booked dates are locked.</Text>
      </>}

      {screen === 'home' && <>
        <View style={styles.weeklySection}>
          <View style={styles.weeklyHeading}>
            <View style={styles.availabilityCopy}>
              <Text style={styles.cardHeading}>Next 7 days</Text>
              <Text style={styles.cardText}>Choose booking dates.</Text>
            </View>
            <View style={styles.availabilityCount}>
              <Text style={styles.availabilityCountValue}>{weeklyAvailableCount} of 7</Text>
              <Text style={styles.availabilityCountLabel}>days free</Text>
            </View>
          </View>
          <View style={styles.weekStrip}>
            {weekDates.map((date) => {
              const key = dateKey(date);
              const booked = bookedDates.has(key);
              const today = key === dateKey(now);
              const available = selectedDates.has(key) && (!today || canSetSameDayAvailability(now)) && !booked;
              const capacity = availabilityCapacity(key);
              const disabled = saving || bookingsLoading || !!bookingsError || groupLoading || booked || (today && !canSetSameDayAvailability(now));
              const status = booked ? 'Booked'
                : available ? groupLoading ? '…' : `${capacity} free`
                  : 'Off';
              return <Pressable
                key={key}
                style={[
                  styles.weekDay,
                  available && styles.weekDayAvailable,
                  booked && styles.weekDayBooked,
                  today && styles.weekDayToday,
                  disabled && !booked && styles.weekDayDisabled,
                ]}
                onPress={() => toggleWeekday(date)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${today ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'long' })} ${date.getDate()}, ${available ? `${capacity} ${capacity === 1 ? 'person' : 'people'} free` : status}${disabled ? '' : ', tap to choose who is available'}`}
                accessibilityState={{ selected: available, disabled }}
              >
                <Text style={[styles.weekDayName, available && styles.weekDayTextAvailable, booked && styles.weekDayTextBooked]}>
                  {today ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short' })}
                </Text>
                <Text style={[styles.weekDayNumber, available && styles.weekDayTextAvailable, booked && styles.weekDayTextBooked]}>{date.getDate()}</Text>
                <Text style={[styles.weekDayStatus, available && styles.weekDayStatusAvailable, booked && styles.weekDayStatusBooked]}>{status}</Text>
              </Pressable>;
            })}
          </View>
          <View style={styles.weeklyFooter}>
            <Text style={styles.cardText}>{groupLoading
              ? 'Loading group size…'
              : groupError
                ? 'Group unavailable; solo work is still open.'
                : 'Choose solo or your group per date.'}</Text>
            {!!groupError && <Pressable onPress={() => { void reloadGroupSize(); }} disabled={groupLoading} accessibilityRole="button">
              <Text style={styles.calendarLink}>Retry</Text>
            </Pressable>}
            <Pressable onPress={() => navigateScreen('availability')} accessibilityRole="button" accessibilityLabel="Open full availability calendar">
              <Text style={styles.calendarLink}>Full calendar</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.shiftCard}>
          <View style={styles.weeklyHeading}>
            <View style={styles.availabilityCopy}>
              <Text style={styles.cardHeading}>Weekly Availability & Shifts</Text>
              <Text style={styles.cardText}>Set your usual work hours.</Text>
            </View>
            <View style={[styles.activeStatus, weeklyAvailableCount ? styles.activeStatusOn : styles.activeStatusOff]}>
              <Text style={[styles.activeStatusText, weeklyAvailableCount ? styles.activeStatusTextOn : styles.activeStatusTextOff]}>
                {weeklyAvailableCount ? 'Active' : 'Not scheduled'}
              </Text>
            </View>
          </View>
          <Text style={styles.presetLabel}>Preferred shift</Text>
          <View style={styles.shiftOptions} accessibilityRole="radiogroup">
            <ShiftOption label="Morning" detail="Morning hours" selected={profile.labourShift === 'morning'} disabled={saving} onPress={() => { void updateShift('morning'); }} />
            <ShiftOption label="Full day" detail="Morning to evening" selected={profile.labourShift === 'full_day'} disabled={saving} onPress={() => { void updateShift('full_day'); }} />
          </View>
        </View>
        <Pressable style={styles.infoCard} onPress={onOpenGroup} accessibilityRole="button">
          <Icon name="people-outline" color={colors.primary} size={25} />
          <View style={styles.availabilityCopy}>
            <Text style={styles.cardHeading}>My work group</Text>
            <Text style={styles.cardText}>Manage the people who work with you</Text>
          </View>
          <Icon name="chevron-forward" color={colors.muted} />
        </Pressable>
      </>}

      {screen === 'profile' && <>
        <View style={styles.workerHeroCard}>
          <Pressable style={styles.workerAvatarPressable} onPress={() => { void chooseProfileImage(); }} disabled={profileImageSaving} accessibilityRole="button" accessibilityLabel="Change profile photo">
            <LinearGradient colors={['#2563EB', '#60A5FA', '#4F46E5']} style={styles.workerAvatarGradient}>
              <View style={styles.workerAvatarInner}>
                {profile.profileImageUrl
                  ? <Image source={{ uri: profile.profileImageUrl }} style={styles.workerAvatarImage} />
                  : <Text style={styles.workerAvatarText}>{profile.firstName.charAt(0).toUpperCase() || 'F'}</Text>}
              </View>
            </LinearGradient>
            <View style={styles.workerCameraBadge}>
              {profileImageSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon name="camera-outline" size={14} color="#FFFFFF" />}
            </View>
          </Pressable>
          <View style={styles.workerIdentity}>
            <Text style={styles.profileName} numberOfLines={1}>{`${profile.firstName} ${profile.lastName}`.trim()}</Text>
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>LABOUR</Text></View>
          </View>
          <View style={styles.profileMetricRow}>
            <View style={styles.profileMetric}><Text style={styles.profileMetricValue}>{selectedDates.size}</Text><Text style={styles.profileMetricLabel}>available days</Text></View>
            <View style={styles.metricDot} />
            <View style={styles.profileMetric}><Text style={styles.profileMetricValue}>{profile.labourSkills.length}</Text><Text style={styles.profileMetricLabel}>skills</Text></View>
            <View style={styles.metricDot} />
            <View style={styles.profileMetric}><Text style={styles.profileMetricValue}>{groupLoading || groupError ? '—' : groupCapacity}</Text><Text style={styles.profileMetricLabel}>group size</Text></View>
          </View>
        </View>

        <View style={styles.profileSectionCard}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.profileSectionTitle}>WORK CREDENTIALS</Text>
            <Icon name="checkmark-done-circle-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.credentialRow}>
            <View style={styles.credentialIcon}><Icon name="phone-portrait-outline" size={18} /></View>
            <View style={styles.credentialCopy}><Text style={styles.credentialLabel}>Mobile Phone</Text><Text style={styles.credentialValue}>{profile.phone}</Text></View>
            <View style={styles.verifiedTag}><Icon name="checkmark-circle-outline" size={13} color={colors.text} /><Text style={styles.verifiedTagText}>VERIFIED</Text></View>
          </View>
          <Pressable style={styles.credentialRow} onPress={() => navigateScreen('setup')} accessibilityRole="button" accessibilityLabel="Edit daily rate">
            <View style={styles.credentialIcon}><Icon name="cash-outline" size={18} /></View>
            <View style={styles.credentialCopy}>
              <Text style={styles.credentialLabel}>Daily Rate</Text>
              <Text style={styles.credentialValue}>{profile.labourDailyRate !== null ? `₹${profile.labourDailyRate} / day` : 'Set your daily rate'}</Text>
            </View>
            <Icon name="pencil-outline" size={18} color={colors.primary} />
          </Pressable>
          <View style={styles.profileLocationGrid}>
            <Pressable style={styles.profileLocationCard} onPress={() => navigateScreen('setup')} accessibilityRole="button" accessibilityLabel="Edit village">
              <View style={styles.locationLabelRow}><Icon name="location-outline" size={16} color={colors.primary} /><Text style={styles.locationLabel}>Village</Text></View>
              <Text style={styles.locationValue} numberOfLines={1}>{profile.labourArea || 'Add village'}</Text>
            </Pressable>
            <Pressable style={styles.profileLocationCard} onPress={() => navigateScreen('setup')} accessibilityRole="button" accessibilityLabel="Edit travel radius">
              <View style={styles.locationLabelRow}><Icon name="navigate-outline" size={16} color={colors.primary} /><Text style={styles.locationLabel}>Radius</Text><Icon name="search-outline" size={13} color={colors.muted} /></View>
              <Text style={styles.locationValue}>{profile.labourTravelRadius !== null ? `${profile.labourTravelRadius} km` : 'Not set'}</Text>
            </Pressable>
          </View>
          <View style={styles.availabilityStatusRow}>
            <View style={[styles.availabilityDot, selectedDates.size > 0 && styles.availabilityDotOn]} />
            <Text style={styles.availabilityStatusText}>{selectedDates.size > 0 ? `${selectedDates.size} upcoming days marked available` : 'No upcoming days marked available'}</Text>
          </View>
        </View>

        <View style={styles.profileSectionCard}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.profileSectionTitle}>SKILLS &amp; EXPERTISE</Text>
            <Pressable onPress={() => { setSkills(profile.labourSkills); navigateScreen('skills'); }} accessibilityRole="button">
              <Text style={styles.addSkillText}>+ Add Skill</Text>
            </Pressable>
          </View>
          {profile.labourSkills.length
            ? <View style={styles.profileSkillList}>{profile.labourSkills.map((skill) => <View key={skill} style={styles.profileSkillChip}>
              <Icon name="leaf-outline" size={15} color={colors.primary} />
              <Text style={styles.profileSkillText}>{skill}</Text>
            </View>)}</View>
            : <Text style={styles.profileSectionHint}>Add skills so farmers can find you for suitable work.</Text>}
        </View>

        <View style={styles.profileSectionCard}>
          <View style={styles.groupHeader}>
            <View style={styles.groupTitleRow}>
              <Text style={styles.groupTitle}>{groupLoading ? 'Loading group…' : `Group of ${groupCapacity}`}</Text>
              <Text style={styles.groupOptional}>OPTIONAL</Text>
            </View>
            <View style={styles.groupIcon}><Icon name="people-outline" size={18} color={colors.primary} /></View>
          </View>
          <Text style={styles.groupNames}>
            {groupError
              ? `Could not load group details: ${groupError}`
              : groupMemberNames.length
                ? groupMemberNames.join(', ')
                : 'Work on your own or add trusted people to your group.'}
          </Text>
          <Pressable style={styles.manageGroupButton} onPress={onOpenGroup} accessibilityRole="button">
            <Icon name="people-outline" size={18} color={colors.primary} />
            <Text style={styles.manageGroupText}>Manage group</Text>
          </Pressable>
        </View>

        <Pressable style={styles.languageRow} onPress={() => setLanguagePickerOpen(true)} accessibilityRole="button" accessibilityLabel="Change preferred language">
          <View style={styles.languageIcon}><Icon name="language-outline" size={20} color={colors.primary} /></View>
          <View style={styles.languageCopy}>
            <Text style={styles.languageLabel}>Preferred Language</Text>
            <Text style={styles.languageValue}>{profile.preferredLanguage === 'en' ? 'English' : 'Telugu'}</Text>
          </View>
          <Icon name="chevron-forward" size={19} color={colors.muted} />
        </Pressable>

        <Pressable style={styles.logoutButton} onPress={() => setConfirmSignOut(true)} disabled={signingOut} accessibilityRole="button">
          <Icon name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Log out'}</Text>
        </Pressable>
      </>}

      {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
    </ScrollView>

    {screen === 'setup' && <View style={styles.footer}>
      <PrimaryButton label={saving ? 'Saving profile…' : 'Continue'} onPress={() => { void saveSetup(); }} disabled={saving} />
    </View>}
    {screen === 'skills' && <View style={styles.footer}>
      <PrimaryButton label={saving ? 'Saving…' : 'Save skills'} onPress={() => { void saveSkills(); }} disabled={saving} />
    </View>}
    {screen === 'availability' && <View style={styles.footer}>
      <PrimaryButton label={saving ? 'Saving…' : 'Save availability'} onPress={() => { void saveAvailability(); }} disabled={saving || bookingsLoading || !!bookingsError} />
    </View>}
    {screen !== 'setup' && <View style={styles.tabBar} accessibilityRole="tablist">
      <TabButton label="Home" icon="home-outline" selected={screen === 'home'} onPress={goHome} />
      <TabButton label="Requests" icon="notifications-outline" selected={false} badgeCount={newRequestCount} onPress={onOpenRequests} />
      <TabButton label="Profile" icon="person-outline" selected={screen === 'profile'} onPress={() => navigateScreen('profile')} />
    </View>}
    <Modal visible={availabilityChoiceDate !== null} transparent animationType="slide" onRequestClose={() => setAvailabilityChoiceDate(null)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.availabilityChoiceSheet}>
          <Text style={styles.confirmTitle}>Who’s available?</Text>
          {!!availabilityChoiceDate && <Text style={styles.confirmCopy}>
            {new Date(`${availabilityChoiceDate}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'full' })}
          </Text>}
          <Pressable style={styles.availabilityChoice} onPress={() => chooseAvailability(1)} accessibilityRole="button">
            <Text style={styles.availabilityChoiceTitle}>Just me — 1 person</Text>
            <Text style={styles.availabilityChoiceCopy}>Only you will be available on this date.</Text>
          </Pressable>
          {groupCapacity > 1 && <Pressable style={styles.availabilityChoice} onPress={() => chooseAvailability(groupCapacity)} accessibilityRole="button">
            <Text style={styles.availabilityChoiceTitle}>My ready group — {groupCapacity} people</Text>
            <Text style={styles.availabilityChoiceCopy}>You and the members marked ready to work.</Text>
          </Pressable>}
          {!!availabilityChoiceDate && selectedDates.has(availabilityChoiceDate) && <Pressable style={styles.unavailableChoice} onPress={() => chooseAvailability(null)} accessibilityRole="button">
            <Text style={styles.unavailableChoiceText}>Mark unavailable</Text>
          </Pressable>}
          <Pressable style={styles.confirmCancel} onPress={() => setAvailabilityChoiceDate(null)} accessibilityRole="button">
            <Text style={styles.confirmCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    <Modal visible={languagePickerOpen} transparent animationType="fade" onRequestClose={() => setLanguagePickerOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Preferred language</Text>
          <Pressable style={styles.languageOption} onPress={() => { void savePreferredLanguage('en'); }} disabled={saving} accessibilityRole="radio" accessibilityState={{ selected: profile.preferredLanguage === 'en' }}>
            <Text style={styles.languageOptionText}>English</Text>
            {profile.preferredLanguage === 'en' && <Icon name="checkmark-circle" size={19} color={colors.primary} />}
          </Pressable>
          <View style={[styles.languageOption, styles.languageOptionDisabled]}>
            <View><Text style={styles.languageOptionText}>Telugu</Text><Text style={styles.languageComingSoon}>Coming soon</Text></View>
            {profile.preferredLanguage === 'te' && <Icon name="checkmark-circle" size={19} color={colors.primary} />}
          </View>
          <Pressable style={styles.confirmCancel} onPress={() => setLanguagePickerOpen(false)} accessibilityRole="button">
            <Text style={styles.confirmCancelText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    <Modal visible={confirmSignOut} transparent animationType="fade" onRequestClose={() => setConfirmSignOut(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Sign out?</Text>
          <Text style={styles.confirmCopy}>You can sign back in with your mobile number.</Text>
          <View style={styles.confirmActions}>
            <Pressable style={styles.confirmCancel} onPress={() => setConfirmSignOut(false)} accessibilityRole="button"><Text style={styles.confirmCancelText}>Stay signed in</Text></Pressable>
            <Pressable style={styles.confirmSignOut} onPress={() => { setConfirmSignOut(false); void signOut(); }} disabled={signingOut} accessibilityRole="button"><Text style={styles.confirmSignOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, onSubmitEditing }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  onSubmitEditing?: () => void;
}) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <AppTextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType={keyboardType}
      onSubmitEditing={onSubmitEditing}
      accessibilityLabel={label}
    />
  </View>;
}

function SkillChips({ skills, onRemove }: { skills: string[]; onRemove: (skill: string) => void }) {
  if (!skills.length) return <Text style={styles.helperText}>Add one or more skills so farmers can find you.</Text>;
  return <View style={styles.chipRow}>
    {skills.map((skill) => <Pressable
      key={skill}
      style={styles.skillChip}
      onPress={() => onRemove(skill)}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${skill}`}
    >
      <Text style={styles.skillChipText}>{skill}</Text>
      <Icon name="close" size={14} color={colors.primary} />
    </Pressable>)}
  </View>;
}

function MonthButton({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable style={styles.monthButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <Icon name={icon} size={20} />
  </Pressable>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable style={[styles.primaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    {disabled && <ActivityIndicator color="#FFFFFF" />}
    <Text style={styles.primaryButtonText}>{label}</Text>
  </Pressable>;
}

function TabButton({ label, icon, selected, badgeCount = 0, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; badgeCount?: number; onPress: () => void }) {
  return <Pressable
    style={styles.tab}
    onPress={onPress}
    accessibilityRole="tab"
    accessibilityLabel={badgeCount > 0 ? `${label}, ${badgeCount} new` : label}
    accessibilityState={{ selected }}
  >
    <View style={styles.tabIcon}>
      <Icon name={icon} size={22} color={selected ? colors.primary : colors.muted} />
      {badgeCount > 0 && <View style={styles.requestBadge}><Text style={styles.requestBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text></View>}
    </View>
    <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{label}</Text>
  </Pressable>;
}

function ShiftOption({ label, detail, selected, disabled, onPress }: {
  label: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return <Pressable
    style={[styles.shiftOption, selected && styles.shiftOptionSelected, disabled && styles.buttonDisabled]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected, disabled }}
  >
    <Text style={[styles.shiftOptionLabel, selected && styles.shiftOptionLabelSelected]}>{label}</Text>
    <Text style={styles.shiftOptionDetail}>{detail}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.screenTop },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
  profileContent: { maxWidth: 480, paddingHorizontal: 16, paddingTop: 7, paddingBottom: 20 },
  profileAppHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  profileBrand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  profileBrandIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: colors.primarySoft },
  profileBrandName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  profileBrandSubtitle: { color: '#94A3B8', fontSize: 10, marginTop: 1 },
  profileNotification: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: colors.screenTop },
  profileHeaderAvatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.surface },
  profileHeaderAvatarImage: { width: 35, height: 35, borderRadius: 18 },
  profileHeaderAvatarText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  profileHeadingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  profileHeaderButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  profilePageHeading: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  headingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  profileBackButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  headingCopy: { flex: 1 },
  heading: { color: colors.text, fontSize: 32, lineHeight: 39, fontWeight: '800', letterSpacing: -0.8 },
  headingAccent: { color: '#3477F6' },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 3 },
  pageTitle: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, marginBottom: 5 },
  pageSubtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 24 },
  field: { marginBottom: 18 },
  fieldLabel: { color: colors.muted, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  input: { minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 17, color: colors.text, backgroundColor: colors.surface, fontSize: 17 },
  secondaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 25, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 14 },
  secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  skillChip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 22, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: colors.surface },
  skillChipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  helperText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: 'transparent' },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 30, backgroundColor: colors.primary, paddingHorizontal: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  buttonDisabled: { opacity: 0.75 },
  tabBar: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  tab: { minWidth: 76, minHeight: 62, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8 },
  tabIcon: { position: 'relative' },
  requestBadge: { position: 'absolute', top: -7, right: -13, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.danger },
  requestBadgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 13, fontWeight: '800' },
  tabLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  tabLabelSelected: { color: colors.primary },
  requestCountError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, borderRadius: 12, backgroundColor: '#FEF2F2' },
  requestCountErrorText: { flex: 1, color: colors.danger, fontSize: 13, lineHeight: 18 },
  weeklySection: { padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  weeklyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  availabilityCount: { minWidth: 82, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 13, backgroundColor: colors.primarySoft },
  availabilityCountValue: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  availabilityCountLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginTop: 16, marginBottom: 12 },
  weekDay: { minHeight: 94, minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  weekDayAvailable: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekDayBooked: { backgroundColor: colors.warningSoft, borderColor: '#FDE68A' },
  weekDayToday: { borderWidth: 2, borderColor: colors.primary },
  weekDayDisabled: { opacity: 0.58 },
  weekDayName: { color: colors.text, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  weekDayNumber: { color: colors.text, fontSize: 18, fontWeight: '800' },
  weekDayTextAvailable: { color: '#FFFFFF' },
  weekDayTextBooked: { color: colors.warning },
  weekDayStatus: { minWidth: 32, textAlign: 'center', color: colors.muted, fontSize: 9, fontWeight: '700' },
  weekDayStatusAvailable: { color: colors.primary, backgroundColor: '#FFFFFF', overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  weekDayStatusBooked: { color: colors.warning, backgroundColor: '#FEF3C7', overflow: 'hidden', paddingHorizontal: 3, paddingVertical: 2, borderRadius: 5 },
  weeklyFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cutoffNote: { color: colors.warning, fontSize: 12, lineHeight: 18, marginTop: 6 },
  calendarLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  calendarDetails: { padding: 14, marginBottom: 16, borderRadius: 16, backgroundColor: colors.primarySoft },
  shiftCard: { padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  activeStatus: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  activeStatusOn: { backgroundColor: colors.successSoft, borderColor: '#A7F3D0' },
  activeStatusOff: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  activeStatusText: { fontSize: 11, fontWeight: '700' },
  activeStatusTextOn: { color: colors.success },
  activeStatusTextOff: { color: colors.muted },
  presetLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9 },
  shiftOptions: { flexDirection: 'row', gap: 9 },
  shiftOption: { minHeight: 68, flex: 1, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  shiftOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  shiftOptionLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  shiftOptionLabelSelected: { color: colors.primary },
  shiftOptionDetail: { color: colors.muted, fontSize: 10, marginTop: 3 },
  infoCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  availabilityCopy: { flex: 1, gap: 5 },
  cardHeading: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  cardText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '700', marginTop: 8, marginBottom: 12 },
  emptyCard: { alignItems: 'center', gap: 9, padding: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, marginVertical: 12 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 8 },
  monthTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  monthControls: { flexDirection: 'row', gap: 10 },
  monthButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 22 },
  weekday: { width: `${100 / 7}%`, height: 36, textAlign: 'center', color: colors.muted, fontSize: 14, fontWeight: '700' },
  calendarCell: { width: `${100 / 7}%`, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  calendarDayAvailable: { backgroundColor: colors.primary },
  calendarDayBooked: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: '#FDE68A' },
  calendarDayPast: { opacity: 0.4 },
  calendarDayText: { color: colors.text, fontSize: 16, fontWeight: '500' },
  calendarDayCapacity: { color: colors.primary, fontSize: 8, lineHeight: 10, fontWeight: '700' },
  calendarDayTextAvailable: { color: '#FFFFFF', fontWeight: '700' },
  calendarDayTextBooked: { color: colors.warning, fontWeight: '700' },
  calendarDayTextPast: { color: colors.muted },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendFree: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary },
  legendBooked: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: '#FDE68A' },
  legendUnavailable: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surfaceMuted },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  outlineChip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 23, borderWidth: 1, borderColor: '#CBD5E1' },
  outlineChipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  workerHeroCard: { alignItems: 'center', padding: 18, marginBottom: 14, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: colors.primary, shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  workerAvatarPressable: { width: 104, height: 104, position: 'relative', marginBottom: 12 },
  workerAvatarGradient: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 52, shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  workerAvatarInner: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 48, borderWidth: 3, borderColor: colors.surface, backgroundColor: colors.primarySoft },
  workerAvatarImage: { width: '100%', height: '100%' },
  workerAvatarText: { color: colors.primary, fontSize: 34, fontWeight: '800' },
  workerCameraBadge: { position: 'absolute', right: 2, bottom: 1, width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.primary },
  workerIdentity: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  profileName: { maxWidth: '75%', color: colors.text, fontSize: 21, fontWeight: '700', textAlign: 'center' },
  roleBadge: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#DBEAFE', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 13 },
  roleBadgeText: { color: colors.primary, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  profileMetricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13, marginTop: 12 },
  profileMetric: { alignItems: 'center' },
  profileMetricValue: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  profileMetricLabel: { color: colors.muted, fontSize: 9, marginTop: 1 },
  metricDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' },
  profileSectionCard: { padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.text, shadowOpacity: 0.025, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  profileSectionTitle: { color: '#64748B', fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  credentialRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, marginBottom: 8, borderRadius: 15, backgroundColor: colors.screenTop },
  credentialIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surface },
  credentialCopy: { flex: 1, minWidth: 0 },
  credentialLabel: { color: colors.muted, fontSize: 11 },
  credentialValue: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 },
  verifiedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 13, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: colors.primarySoft },
  verifiedTagText: { color: colors.primary, fontSize: 8, fontWeight: '700' },
  profileLocationGrid: { flexDirection: 'row', gap: 9, marginTop: 2 },
  profileLocationCard: { flex: 1, minWidth: 0, minHeight: 74, justifyContent: 'center', padding: 11, borderRadius: 15, backgroundColor: colors.screenTop },
  locationLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  locationLabel: { flex: 1, color: colors.muted, fontSize: 11 },
  locationValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  availabilityStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingHorizontal: 2 },
  availabilityDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  availabilityDotOn: { backgroundColor: colors.success },
  availabilityStatusText: { color: colors.muted, fontSize: 10 },
  addSkillText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  profileSkillList: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  profileSkillChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.screenTop },
  profileSkillText: { color: colors.text, fontSize: 12, fontWeight: '500' },
  profileSectionHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  groupTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  groupOptional: { color: colors.muted, fontSize: 10, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  groupIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primarySoft },
  groupNames: { color: colors.muted, fontSize: 12, lineHeight: 19, marginVertical: 8 },
  manageGroupButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: colors.primarySoft },
  manageGroupText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  languageRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 19, backgroundColor: colors.surface },
  languageIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primarySoft },
  languageCopy: { flex: 1 },
  languageLabel: { color: colors.muted, fontSize: 11 },
  languageValue: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
  languageOption: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13 },
  languageOptionText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  languageOptionDisabled: { opacity: 0.55 },
  languageComingSoon: { color: colors.muted, fontSize: 10, marginTop: 2 },
  logoutButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, borderWidth: 1, borderColor: '#FECDD3', borderRadius: 16, backgroundColor: colors.surface },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20, 32, 23, 0.48)', justifyContent: 'center', padding: 22 },
  confirmCard: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 18, padding: 20 },
  confirmTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  confirmCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8 },
  availabilityChoiceSheet: { width: '100%', maxWidth: 480, padding: 22, borderRadius: 24, backgroundColor: colors.surface },
  availabilityChoice: { minHeight: 70, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 11, marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  availabilityChoiceTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  availabilityChoiceCopy: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  unavailableChoice: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 12, borderRadius: 14, backgroundColor: '#FEF2F2' },
  unavailableChoiceText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 18 },
  confirmCancel: { minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 9 },
  confirmCancelText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  confirmSignOut: { minHeight: 40, paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center', borderRadius: 9, backgroundColor: colors.danger },
  confirmSignOutText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  profileRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  profileValue: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  rowDivider: { height: 1, backgroundColor: colors.border },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
