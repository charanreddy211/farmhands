import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput as NativeTextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import NewRequestScreen from './components/NewRequestScreen';
import FindWorkersScreen from './components/FindWorkersScreen';
import LabourExperienceScreen from './components/LabourExperienceScreen';
import LabourRequestsScreen from './components/LabourRequestsScreen';
import BookingsScreen from './components/BookingsScreen';
import AlertsScreen from './components/AlertsScreen';
import MyWorkersScreen from './components/MyWorkersScreen';
import ProfileScreen from './components/ProfileScreen';
import OnboardingScreen from './components/OnboardingScreen';
import MakeGroupScreen from './components/MakeGroupScreen';
import BrandLogo from './components/BrandLogo';
import Text from './components/AppText';
import AppTextInput from './components/AppTextInput';
import { fetchProfile, UserProfile } from './api/profile';
import { API_URL, createRequest, fetchRequests, LabourRequest } from './api/requests';
import { fetchFarmerAlerts, type WorkerProfile } from './api/workers';
import { colors } from './theme';

type Tab = 'home' | 'post';
type NetworkTab = 'requests' | 'find' | 'bookings' | 'alerts' | 'workers';
type StoredSession = { userId: string; phone: string; expiresAt: number };

const SESSION_STORAGE_KEY = 'farmhands.session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function Icon({ name, size = 20, color = '#2563EB' }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const [tab, setTab] = useState<Tab>('home');
  const [networkTab, setNetworkTab] = useState<NetworkTab>('find');
  const [requests, setRequests] = useState<LabourRequest[]>([]);
  const [farmerAlertCount, setFarmerAlertCount] = useState(0);
  const [farmerAlertError, setFarmerAlertError] = useState('');
  const [selectedWorkers, setSelectedWorkers] = useState<WorkerProfile[]>([]);
  const [initialWorkerDates, setInitialWorkerDates] = useState<{ from: string; to: string } | null>(null);
  const [initialBookingBucket, setInitialBookingBucket] = useState<'upcoming' | 'pending' | 'past'>('upcoming');
  const [requestContext, setRequestContext] = useState<{ from: string; to: string; peopleNeeded: number } | null>(null);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const otpRefs = useRef<Array<NativeTextInput | null>>([]);
  const [otpRequested, setOtpRequested] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [labourRequestsOpen, setLabourRequestsOpen] = useState(false);
  const [labourGroupOpen, setLabourGroupOpen] = useState(false);
  const [labourHomeScreen, setLabourHomeScreen] = useState<'home' | 'profile'>('home');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= 800;
  const isNewWorkerSearch = tab === 'home' && networkTab === 'find' && !profileOpen;
  const isNewRequest = tab === 'post' && !profileOpen;
  const isBookingsScreen = tab === 'home' && networkTab === 'bookings' && !profileOpen;
  const isFarmer = Boolean(profile?.roles.includes('farmer'));
  const isFullScreenFlow = isNewWorkerSearch || isNewRequest || isBookingsScreen
    || (tab === 'home' && (networkTab === 'alerts' || networkTab === 'workers') && !profileOpen);

  useEffect(() => {
    if (!userId || !isFarmer) {
      setFarmerAlertCount(0);
      setFarmerAlertError('');
      return;
    }
    let active = true;
    let refreshing = false;
    const refreshFarmerAlerts = async () => {
      if (!active || refreshing || AppState.currentState !== 'active') return;
      refreshing = true;
      try {
        const alerts = await fetchFarmerAlerts(userId);
        if (active) {
          setFarmerAlertCount(alerts.length);
          setFarmerAlertError('');
        }
      } catch (alertError) {
        if (active) setFarmerAlertError(alertError instanceof Error
          ? `Could not check alerts: ${alertError.message}`
          : 'Could not check alerts.');
      } finally {
        refreshing = false;
      }
    };
    void refreshFarmerAlerts();
    const interval = setInterval(() => { void refreshFarmerAlerts(); }, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshFarmerAlerts();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId, isFarmer, networkTab]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SESSION_STORAGE_KEY)
      .then(async (savedSession) => {
        if (!savedSession) return;
        const session = JSON.parse(savedSession) as Partial<StoredSession>;
        if (typeof session.userId !== 'string' || typeof session.phone !== 'string' || typeof session.expiresAt !== 'number') {
          await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }
        if (session.expiresAt <= Date.now()) {
          await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }
        if (active) {
          setProfileLoading(true);
          setUserId(session.userId);
          setUserPhone(session.phone);
          setPhone(session.phone);
        }
      })
      .catch(() => {
        if (active) setAuthError('Could not restore your saved sign-in. Please sign in again.');
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!userPhone) return;
    let active = true;
    setRequestsLoading(true);
    setRequestsError('');
    fetchRequests()
      .then((data) => { if (active) setRequests(data); })
      .catch(() => { if (active) setRequestsError('Could not load requests. Check that the backend is running.'); })
      .finally(() => { if (active) setRequestsLoading(false); });
    return () => { active = false; };
  }, [userPhone, tab]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileError('');
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    setProfileError('');
    fetchProfile(userId)
      .then((userProfile) => { if (active) setProfile(userProfile); })
      .catch(() => {
        if (!active) return;
        setProfile(null);
        setProfileError('Could not load your profile. Check your connection and try again.');
      })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [userId, profileLoadAttempt]);

  async function publishRequest(input: Parameters<typeof createRequest>[0]) {
    const createdRequest = await createRequest(input);
    setRequests((current) => [createdRequest, ...current]);
    return createdRequest;
  }

  async function requestOtp() {
    if (!phone.trim()) return;
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.trim() }) });
      if (!response.ok) throw new Error('Unable to send OTP');
      setOtpRequested(true);
    } catch {
      setAuthError('Could not reach the server. Start the backend and try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      setAuthError('Enter all six digits to continue.');
      return;
    }
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }) });
      if (!response.ok) throw new Error('Unable to verify OTP');
      const result = await response.json() as { user?: { id?: string; phone?: string } };
      if (!result.user?.id) throw new Error('The server did not return a user profile.');
      const verifiedPhone = result.user.phone ?? phone.trim();
      const session: StoredSession = {
        userId: result.user.id,
        phone: verifiedPhone,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      setProfileLoading(true);
      setUserId(result.user.id);
      setUserPhone(verifiedPhone);
    } catch {
      setAuthError('Could not verify your number or save your sign-in. Check the server and try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    setUserId(null);
    setUserPhone(null);
    setPhone('');
    setOtp('');
    setOtpRequested(false);
    setProfile(null);
    setProfileOpen(false);
    setNetworkTab('find');
    setInitialWorkerDates(null);
    setLabourRequestsOpen(false);
    setLabourGroupOpen(false);
    setLabourHomeScreen('home');
  }

  if (fontError) throw fontError;
  if (!fontsLoaded) return <View style={styles.fontLoading}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={[colors.screenTop, colors.primarySoft, colors.background]}
        locations={[0, 0.28, 0.64]}
        start={{ x: 0.72, y: 0 }}
        end={{ x: 0.38, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {!authReady ? <View style={authStyles.restoringSession}><ActivityIndicator color={colors.primary} /><Text style={authStyles.restoringText}>Restoring your sign-in…</Text></View> : !userPhone ? <ScrollView style={authStyles.authScroll} contentContainerStyle={authStyles.authScreen} keyboardShouldPersistTaps="handled">
        <View style={authStyles.authHeader}><BrandLogo /></View>
        <View style={authStyles.authCopy}>
          <Text style={authStyles.authHeading}>{otpRequested ? <>Enter the <Text style={authStyles.authAccent}>code</Text></> : <>Enter your <Text style={authStyles.authAccent}>mobile number</Text></>}</Text>
          {otpRequested
            ? <Text style={authStyles.authSubheading}>Sent to +91 {phone} · <Text style={authStyles.authLink} onPress={() => { setOtpRequested(false); setOtp(''); }}>Change</Text></Text>
            : <Text style={authStyles.authSubheading}>Use your mobile number to sign in.</Text>}
        </View>
        <View style={authStyles.authForm}>
          {!otpRequested ? <View style={authStyles.phoneInputRow}>
            <Text style={authStyles.countryCode}>+91</Text>
            <AppTextInput style={authStyles.phoneInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Enter your number" placeholderTextColor="#64748B" accessibilityLabel="Mobile number" />
          </View> : <>
            <View style={authStyles.otpRow}>{Array.from({ length: 6 }, (_, index) => <AppTextInput key={index} ref={(ref) => { otpRefs.current[index] = ref; }} style={[authStyles.otpCell, !!otp[index] && authStyles.otpCellFilled, !!authError && authStyles.otpCellError]} value={otp[index] ?? ''} onChangeText={(value) => { const digit = value.replace(/\D/g, '').slice(-1); const nextOtp = otp.split(''); nextOtp[index] = digit; setOtp(nextOtp.join('').slice(0, 6)); if (digit && index < 5) otpRefs.current[index + 1]?.focus(); }} onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus(); }} keyboardType="number-pad" maxLength={1} autoFocus={index === 0} accessibilityLabel={`Code digit ${index + 1}`} />)}</View>
            {!!authError && <Text style={authStyles.authError} accessibilityRole="alert">{authError}</Text>}
            <Pressable style={authStyles.resendRow} onPress={requestOtp} accessibilityRole="button"><Text style={authStyles.authLink}>Resend code</Text></Pressable>
          </>}
        </View>
        <Text style={authStyles.privacy}><Icon name="lock-closed-outline" size={17} color="#64748B" /> {otpRequested ? 'Development sign-in accepts any six-digit code.' : 'Your number stays private. SMS verification is not enabled yet.'}</Text>
        <View style={authStyles.authFooter}>
          <Pressable style={[authStyles.publishButton, authLoading && authStyles.disabled]} onPress={otpRequested ? verifyOtp : requestOtp} disabled={authLoading} accessibilityRole="button">
            {authLoading && <ActivityIndicator color="#FFFFFF" />}
            <Text style={authStyles.publishText}>{authLoading ? 'Please wait…' : otpRequested ? 'Verify' : 'Continue'}</Text>
          </Pressable>
        </View>
      </ScrollView> : profileLoading ? <View style={authStyles.restoringSession}><ActivityIndicator color="#2563EB" /><Text style={authStyles.restoringText}>Loading your profile…</Text></View> : profileError ? <View style={authStyles.restoringSession}><Text style={styles.authError}>{profileError}</Text><Pressable style={authStyles.publishButton} onPress={() => setProfileLoadAttempt((attempt) => attempt + 1)} accessibilityRole="button"><Text style={authStyles.publishText}>Retry</Text></Pressable></View> : profile && (profile.roles.length === 0 || (profile.roles.includes('farmer') && !profile.onboardingComplete)) && userId ? <OnboardingScreen
        key={`onboarding-${userId}`}
        userId={userId}
        profile={profile}
        onProfileChange={setProfile}
      /> : profile?.roles.includes('labour') && userId ? labourGroupOpen ? <MakeGroupScreen
        key={`group-${userId}`}
        leaderId={userId}
        leaderName={`${profile.firstName} ${profile.lastName}`.trim()}
        onBack={() => setLabourGroupOpen(false)}
      /> : labourRequestsOpen ? <LabourRequestsScreen
        key={`requests-${userId}`}
        workerId={userId}
        onBackToHome={() => { setLabourRequestsOpen(false); setLabourHomeScreen('home'); }}
        onOpenProfile={() => { setLabourRequestsOpen(false); setLabourHomeScreen('profile'); }}
      /> : <LabourExperienceScreen
        key={`${userId}-${labourHomeScreen}`}
        userId={userId}
        profile={profile}
        initialScreen={labourHomeScreen}
        onProfileChange={setProfile}
        onOpenRequests={() => { setLabourHomeScreen('home'); setLabourRequestsOpen(true); }}
        onOpenGroup={() => setLabourGroupOpen(true)}
        onSignOut={signOut}
      /> : <View style={[styles.shell, isWide && styles.shellWide]}>
        {!isFullScreenFlow && <View style={styles.header}>
          <Pressable
            style={styles.brandRow}
            onPress={() => {
              setProfileOpen(false);
              setTab('home');
              setNetworkTab('find');
            }}
            accessibilityRole="button"
            accessibilityLabel="Go to local network"
          >
            <BrandLogo />
          </Pressable>
          <Pressable style={styles.profileButton} accessibilityLabel="Open profile" onPress={() => setProfileOpen(true)}>
            {profile?.profileImageUrl
              ? <Image source={{ uri: profile.profileImageUrl }} style={styles.profileImage} />
              : <Text style={styles.profileInitial}>{profile?.firstName?.charAt(0).toUpperCase() || 'R'}</Text>}
          </Pressable>
        </View>}

        {profileOpen && userId ? <ProfileScreen
          userId={userId}
          phone={userPhone ?? ''}
          onBack={() => setProfileOpen(false)}
          onProfileChange={setProfile}
          onSignOut={signOut}
        /> : <>
          {tab === 'home' && !isFullScreenFlow && <View style={networkTabStyles.networkTabs} accessibilityRole="tablist">
            <Pressable style={[networkTabStyles.networkTab, networkTab === 'find' && networkTabStyles.networkTabActive]} onPress={() => setNetworkTab('find')} accessibilityRole="tab" accessibilityState={{ selected: networkTab === 'find' }}>
              <Text style={[networkTabStyles.networkTabLabel, networkTab === 'find' && networkTabStyles.networkTabLabelActive]}>Find workers</Text>
            </Pressable>
            <Pressable style={[networkTabStyles.networkTab, networkTab === 'requests' && networkTabStyles.networkTabActive]} onPress={() => setNetworkTab('requests')} accessibilityRole="tab" accessibilityState={{ selected: networkTab === 'requests' }}>
              <Text style={[networkTabStyles.networkTabLabel, networkTab === 'requests' && networkTabStyles.networkTabLabelActive]}>Farmer requests</Text>
            </Pressable>
          </View>}
          {tab === 'home' && networkTab === 'find' && <FindWorkersScreen
            farmerId={userId ?? ''}
            alertCount={farmerAlertCount}
            alertCountError={farmerAlertError}
            initialSelectedWorkers={selectedWorkers}
            onPostRequest={(workers, details) => { setSelectedWorkers(workers); setRequestContext(details); setTab('post'); }}
            onOpenProfile={() => setProfileOpen(true)}
            onOpenBookings={() => {
              setInitialBookingBucket('upcoming');
              setNetworkTab('bookings');
            }}
            onOpenAlerts={() => setNetworkTab('alerts')}
            onOpenSavedWorkers={() => setNetworkTab('workers')}
            initialSearchDates={initialWorkerDates}
          />}
          {tab === 'home' && networkTab === 'bookings' && userId && <BookingsScreen
            farmerId={userId}
            alertCount={farmerAlertCount}
            alertCountError={farmerAlertError}
            initialBucket={initialBookingBucket}
            onFindWorkers={() => setNetworkTab('find')}
            onOpenAlerts={() => setNetworkTab('alerts')}
            onOpenProfile={() => setProfileOpen(true)}
          />}
          {tab === 'home' && networkTab === 'alerts' && userId && <AlertsScreen
            farmerId={userId}
            onFindWorkers={(alert) => {
              if (alert?.from && alert.to) setInitialWorkerDates({ from: alert.from, to: alert.to });
              setNetworkTab('find');
            }}
            onOpenBookings={(bucket = 'upcoming') => {
              setInitialBookingBucket(bucket);
              setNetworkTab('bookings');
            }}
            onOpenProfile={() => setProfileOpen(true)}
          />}
          {tab === 'home' && networkTab === 'workers' && userId && <MyWorkersScreen
            farmerId={userId}
            onBack={() => setNetworkTab('find')}
            onBookAgain={(worker) => {
              const today = new Date();
              const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              setInitialWorkerDates({ from: day, to: day });
              setSelectedWorkers([worker]);
              setRequestContext({ from: day, to: day, peopleNeeded: 1 });
              setNetworkTab('find');
            }}
          />}
          {tab === 'home' && networkTab === 'requests' && <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={networkStyles.sectionHeader}><Text style={networkStyles.sectionTitle}>Open farmer requests</Text><View style={networkStyles.activeCount}><Text style={networkStyles.activeCountText}>{requests.length} ACTIVE</Text></View></View>
            {!!requestsError && <Text style={styles.authError}>{requestsError}</Text>}
            {!requestsLoading && !requestsError && requests.length === 0 && <Text style={styles.sectionMeta}>No requests yet. Post the first one when a crew is needed.</Text>}
            {requests.map((request) => <RequestCard key={request.id} request={request} />)}
          </ScrollView>}
          {tab === 'post' && profile && <NewRequestScreen
            farmerId={profile.id}
            profile={profile}
            selectedWorkers={selectedWorkers}
            initialDates={requestContext}
            initialPeopleNeeded={requestContext?.peopleNeeded ?? 1}
            onPublish={publishRequest}
            onViewRequests={() => { setSelectedWorkers([]); setRequestContext(null); setNetworkTab('requests'); setTab('home'); }}
            onBackToSearch={() => { setNetworkTab('find'); setTab('home'); }}
          />}
        </>}

        {!profileOpen && !isFullScreenFlow && <View style={fixedActionStyles.footer}>
          {tab === 'home' ? <Pressable style={fixedActionStyles.cta} onPress={() => setTab('post')} accessibilityRole="button">
            <View style={fixedActionStyles.plus}><Icon name="add" size={22} color="#2563EB" /></View>
            <View style={fixedActionStyles.ctaCopy}><Text style={fixedActionStyles.ctaTitle}>Post a new request</Text><Text style={fixedActionStyles.ctaSubtitle}>Find nearby farmhands</Text></View>
            <View style={fixedActionStyles.arrow}><Icon name="arrow-forward" size={19} color="#2563EB" /></View>
          </Pressable> : <Pressable style={fixedActionStyles.backButton} onPress={() => setTab('home')} accessibilityRole="button"><Icon name="arrow-back" size={18} color="#2563EB" /><Text style={fixedActionStyles.backText}>Back to local network</Text></Pressable>}
        </View>}
      </View>}
    </SafeAreaView>
  );
}

function RequestCard({ request }: { request: LabourRequest }) {
  const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const dates = `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;
  return <View style={networkStyles.requestCard}>
    <View style={networkStyles.requestTop}>
      {request.imageUrl
        ? <Image source={{ uri: request.imageUrl }} style={networkStyles.cropPhoto} />
        : <View style={networkStyles.cropMark}><Icon name="leaf-outline" size={17} color="#2563EB" /></View>}
      <View style={networkStyles.requestTitle}><Text style={networkStyles.cardTitle} numberOfLines={1}>{request.title}</Text><Text style={networkStyles.cardMeta} numberOfLines={1}>{request.area}</Text></View>
      <View style={networkStyles.openBadge}><Text style={networkStyles.openText}>{request.status.toUpperCase()}</Text></View>
    </View>
    <View style={networkStyles.requestBottom}>
      <View style={networkStyles.detail}><Icon name="calendar-outline" size={12} color="#64748B" /><Text style={networkStyles.detailText}>{dates}</Text></View>
      <View style={networkStyles.detail}><Icon name="people-outline" size={12} color="#64748B" /><Text style={networkStyles.detailText}>{request.peopleNeeded} people</Text></View>
      <Text style={networkStyles.detailStrong}>₹{request.payPerDay} / day</Text>
      <View style={networkStyles.requestArrow}><Icon name="arrow-forward" size={13} color="#2563EB" /></View>
    </View>
  </View>;
}

const networkTabStyles = StyleSheet.create({
  networkTabs: { flexDirection: 'row', backgroundColor: '#EFF6FF', borderRadius: 22, padding: 4, gap: 4, marginHorizontal: 20, marginTop: 12, marginBottom: 4 },
  networkTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingHorizontal: 8 },
  networkTabActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 19 },
  networkTabLabel: { color: '#667892', fontSize: 14, fontWeight: '700' },
  networkTabLabelActive: { color: '#2563EB' },
});

const fixedActionStyles = StyleSheet.create({
  footer: { backgroundColor: '#FFFFFF', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  cta: { height: 58, borderRadius: 29, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 10 },
  plus: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  ctaCopy: { flex: 1 },
  ctaTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  ctaSubtitle: { color: '#EFF6FF', fontSize: 10, marginTop: 2 },
  arrow: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  backButton: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  backText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
});

const authStyles = StyleSheet.create({
  authScroll: { flex: 1, backgroundColor: 'transparent' },
  restoringSession: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 10 },
  restoringText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  authScreen: { width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
  authHeader: { minHeight: 52, justifyContent: 'center', marginBottom: 78 },
  authCopy: { marginBottom: 30 },
  authHeading: { color: '#0F172A', fontSize: 38, lineHeight: 47, fontWeight: '800', letterSpacing: -1 },
  authAccent: { color: '#3477F6' },
  authSubheading: { color: '#64748B', fontSize: 17, lineHeight: 25, marginTop: 8 },
  authLink: { color: '#0F172A', fontWeight: '700' },
  authForm: { backgroundColor: 'transparent' },
  phoneInputRow: { minHeight: 66, backgroundColor: '#FFFFFF', borderRadius: 32, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 18 },
  countryCode: { color: '#0F172A', fontSize: 17, fontWeight: '700', paddingRight: 15, borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  phoneInput: { flex: 1, height: 62, paddingHorizontal: 14, color: '#0F172A', fontSize: 18, fontWeight: '600' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginTop: 2 },
  otpCell: { flex: 1, minWidth: 0, height: 64, textAlign: 'center', color: '#0F172A', fontSize: 24, fontWeight: '800', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20 },
  otpCellFilled: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  otpCellError: { borderColor: '#B91C1C' },
  resendRow: { alignSelf: 'flex-start', paddingVertical: 12 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 10, color: '#64748B', fontSize: 14, lineHeight: 21, marginTop: 18 },
  authError: { color: '#B91C1C', fontSize: 14, lineHeight: 20, marginTop: 8 },
  authFooter: { marginTop: 'auto', paddingTop: 34 },
  publishButton: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#2563EB', borderRadius: 34, paddingHorizontal: 18 },
  publishText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  disabled: { opacity: 0.65 },
});

const networkStyles = StyleSheet.create({
  greeting: { marginBottom: 18 },
  heading: { color: '#0F172A', fontSize: 29, lineHeight: 35, fontWeight: '800' },
  subheading: { color: '#64748B', fontSize: 14, lineHeight: 20, marginTop: 5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, marginTop: 0 },
  sectionTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' },
  sectionMeta: { color: '#64748B', fontSize: 12, marginTop: 4 },
  activeCount: { backgroundColor: '#EFF6FF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  activeCountText: { color: '#2563EB', fontSize: 10, fontWeight: '800' },
  requestCard: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 13, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#213653', shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  requestTop: { flexDirection: 'row', alignItems: 'center', minHeight: 35 },
  cropMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  cropPhoto: { width: 48, height: 44, borderRadius: 15, backgroundColor: '#EFF6FF', marginRight: 11 },
  requestTitle: { flex: 1, minWidth: 0 },
  cardTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#64748B', fontSize: 12, marginTop: 4 },
  openBadge: { backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 5, paddingHorizontal: 8, marginLeft: 5 },
  openText: { color: '#047857', fontSize: 9, fontWeight: '800' },
  requestBottom: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E2E8F0', marginTop: 12, paddingTop: 11, gap: 10 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  detailText: { color: '#64748B', fontSize: 11 },
  detailStrong: { color: '#0F172A', fontSize: 11, fontWeight: '800', marginLeft: 'auto' },
  requestArrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
});

const styles = StyleSheet.create({
  fontLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  authError: { color: '#B91C1C', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 14 },
  safe: { flex: 1, backgroundColor: 'transparent' },
  shell: { flex: 1, backgroundColor: 'transparent' },
  shellWide: { maxWidth: 920, alignSelf: 'center', width: '100%' },
  header: { minHeight: 78, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  profileButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  profileImage: { width: 44, height: 44 },
  profileInitial: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  content: { paddingHorizontal: 24, paddingTop: 34, paddingBottom: 38 },
  greeting: { marginBottom: 24 },
  eyebrow: { color: '#2563EB', fontSize: 12, letterSpacing: 1.5, fontWeight: '800', marginBottom: 8 },
  heading: { color: '#0F172A', fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 },
  subheading: { color: '#64748B', fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 560 },
  primaryCta: { backgroundColor: '#2563EB', borderRadius: 26, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  ctaLabel: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  ctaSub: { color: '#EFF6FF', fontSize: 13, marginTop: 5 },
  ctaIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, marginTop: 4 },
  sectionTitle: { color: '#0F172A', fontSize: 19, fontWeight: '800' },
  sectionMeta: { color: '#64748B', fontSize: 13, marginTop: 4 },
  link: { color: '#2563EB', fontWeight: '700', fontSize: 14, paddingBottom: 2 },
  requestCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 17, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  requestTop: { flexDirection: 'row', alignItems: 'center' },
  cropMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  requestTitle: { flex: 1 },
  cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '800' },
  cardMeta: { color: '#64748B', fontSize: 13, marginTop: 4 },
  openBadge: { backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 5, paddingHorizontal: 8 },
  openText: { color: '#047857', fontSize: 10, letterSpacing: 0.4, fontWeight: '800' },
  requestDetails: { flexDirection: 'row', gap: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', marginTop: 15, paddingTop: 12, alignItems: 'center' },
  detail: { color: '#64748B', fontSize: 12 },
  detailStrong: { color: '#0F172A', fontSize: 12, fontWeight: '800', marginLeft: 'auto' },
  interest: { color: '#2563EB', fontSize: 12, marginTop: 12, fontWeight: '700' },
  groupScroll: { gap: 12, paddingBottom: 4 },
  groupCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'flex-start' },
  groupCardCompact: { width: 310, marginBottom: 0 },
  groupAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  groupBody: { flex: 1 },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availabilityDot: { width: 8, height: 8, borderRadius: 4 },
  skills: { color: '#2563EB', fontSize: 12, marginTop: 7 },
  availability: { color: '#047857', fontSize: 12, fontWeight: '700', marginTop: 8 },
  unavailable: { color: '#64748B' },
  chevron: { padding: 4 },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  formLabel: { color: '#64748B', fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 6 },
  input: { minHeight: 54, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, paddingHorizontal: 16, color: '#0F172A', fontSize: 16, backgroundColor: '#FFFFFF', marginBottom: 12 },
  formRow: { flexDirection: 'row', gap: 12 },
  formHalf: { flex: 1 },
  inputButton: { minHeight: 54, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 17, backgroundColor: '#FFFFFF' },
  inputButtonText: { flex: 1, color: '#64748B', fontSize: 15 },
  selectedDate: { color: '#0F172A', fontWeight: '700' },
  datePickerBackdrop: { flex: 1, backgroundColor: 'rgba(17, 26, 46, 0.38)', justifyContent: 'flex-end' },
  datePickerSheet: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 26, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  datePickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePickerAction: { color: '#64748B', fontSize: 15, fontWeight: '700' },
  datePickerActionText: { color: '#2563EB' },
  publishButton: { backgroundColor: '#2563EB', minHeight: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
  publishText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  formHint: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 13 },
  filterRow: { minHeight: 54, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  checkboxOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  filterCount: { color: '#64748B', fontSize: 13, marginLeft: 'auto' },
  tabBar: { minHeight: 78, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  tab: { alignItems: 'center', minWidth: 78 },
  tabLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 5 },
  tabLabelActive: { color: '#2563EB' }
});
