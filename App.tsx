import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import NewRequestScreen from './components/NewRequestScreen';
import { API_URL, createRequest, fetchRequests, LabourRequest } from './api/requests';

type Tab = 'home' | 'post';
type NetworkTab = 'requests' | 'labour';
type Group = { id: number; name: string; area: string; members: number; skills: string[]; available: boolean; nextDate: string; color: string };

const groups: Group[] = [
  { id: 1, name: 'Green Valley Crew', area: 'Sira, Tumakuru', members: 12, skills: ['Harvesting', 'Sorting'], available: true, nextDate: 'Available today', color: '#DCE9D4' },
  { id: 2, name: 'Kaveri Field Team', area: 'Maddur, Mandya', members: 8, skills: ['Transplanting', 'Irrigation'], available: true, nextDate: 'From tomorrow', color: '#F4E6BE' },
  { id: 3, name: 'Sunrise Women Farmers', area: 'Channapatna', members: 15, skills: ['Picking', 'Packing'], available: false, nextDate: 'Available 24 Sep', color: '#E8D9D2' },
];

function Icon({ name, size = 20, color = '#53634B' }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [networkTab, setNetworkTab] = useState<NetworkTab>('requests');
  const [requests, setRequests] = useState<LabourRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const [availabilityOnly, setAvailabilityOnly] = useState(true);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const otpRefs = useRef<Array<TextInput | null>>([]);
  const [otpRequested, setOtpRequested] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const visibleGroups = useMemo(() => availabilityOnly ? groups.filter((group) => group.available) : groups, [availabilityOnly]);

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

  async function publishRequest(input: Parameters<typeof createRequest>[0]) {
    const createdRequest = await createRequest(input);
    setRequests((current) => [createdRequest, ...current]);
    setNetworkTab('requests');
    setTab('home');
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
      await response.json();
      setUserPhone(phone.trim());
    } catch {
      setAuthError('Could not verify your number. Start the backend and try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {!userPhone ? <ScrollView style={authStyles.authScroll} contentContainerStyle={authStyles.authScreen} keyboardShouldPersistTaps="handled">
        <View style={authStyles.authHeader}><View style={styles.brandRow}><View style={styles.logo}><Icon name="leaf" size={17} color="#F6F1E8" /></View><View><Text style={styles.brand}>Farmhands</Text><Text style={styles.brandSub}>LOCAL NETWORK</Text></View></View><View style={authStyles.helpChip}><Icon name="help-circle-outline" size={14} /><Text style={authStyles.helpText}>Help</Text></View></View>
        <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=85' }} imageStyle={authStyles.heroImage} style={authStyles.hero}>
          <View style={authStyles.heroShade} />
          <View style={authStyles.heroContent}><View style={authStyles.nearbyBadge}><View style={authStyles.liveDot} /><Text style={authStyles.nearbyText}>NEARBY WORK</Text></View><Text style={authStyles.heroTitle}>Good work starts close to home.</Text><Text style={authStyles.heroSubtitle}>Meet trusted people and grow stronger farms.</Text></View>
        </ImageBackground>
        <View style={authStyles.authCopy}><View style={authStyles.welcomeRow}><Text style={authStyles.authHeading}>{otpRequested ? 'Welcome back' : 'Welcome to the network'}</Text><Text style={authStyles.stepChip}>{otpRequested ? 'STEP 2 OF 2' : 'STEP 1 OF 2'}</Text></View><Text style={authStyles.authSubheading}>{otpRequested ? `Enter the six-digit code sent to ${phone}.` : 'Use your mobile number. No password needed.'}</Text></View>
        <View style={authStyles.authForm}>
          {!otpRequested ? <><View style={authStyles.labelRow}><Text style={authStyles.formLabel}>Mobile number</Text></View><View style={authStyles.phoneInputRow}><Text style={authStyles.countryCode}>🇮🇳  +91</Text><TextInput style={authStyles.phoneInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98765 43210" placeholderTextColor="#777D70" /></View><Pressable style={authStyles.publishButton} onPress={requestOtp} disabled={authLoading}><View style={authStyles.buttonShield}><Icon name="shield-checkmark-outline" size={17} color="#244630" /></View><View style={authStyles.buttonCopy}><Text style={authStyles.publishText}>{authLoading ? 'Sending...' : 'Verify number'}</Text><Text style={authStyles.buttonSub}>Your local network awaits</Text></View><View style={authStyles.buttonArrow}><Icon name="arrow-forward" size={20} color="#244630" /></View></Pressable></> : <><View style={authStyles.labelRow}><Text style={authStyles.formLabel}>Enter 6-digit code</Text><Text style={authStyles.codeHint}>Code sent</Text></View><View style={authStyles.otpRow}>{Array.from({ length: 6 }, (_, index) => <TextInput key={index} ref={(ref) => { otpRefs.current[index] = ref; }} style={[authStyles.otpCell, !!otp[index] && authStyles.otpCellFilled]} value={otp[index] ?? ''} onChangeText={(value) => { const digit = value.replace(/\D/g, '').slice(-1); const nextOtp = otp.split(''); nextOtp[index] = digit; setOtp(nextOtp.join('').slice(0, 6)); if (digit && index < 5) otpRefs.current[index + 1]?.focus(); }} onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus(); }} keyboardType="number-pad" maxLength={1} autoFocus={index === 0} accessibilityLabel={`Code digit ${index + 1}`} />)}</View><Pressable style={authStyles.resendRow} onPress={requestOtp}><Text style={authStyles.resendText}>Didn't get it? Resend code</Text></Pressable><Pressable style={authStyles.publishButton} onPress={verifyOtp} disabled={authLoading}><View style={authStyles.buttonShield}><Icon name="shield-checkmark-outline" size={17} color="#244630" /></View><View style={authStyles.buttonCopy}><Text style={authStyles.publishText}>{authLoading ? 'Checking...' : 'Verify & enter'}</Text><Text style={authStyles.buttonSub}>Your local network awaits</Text></View><View style={authStyles.buttonArrow}><Icon name="arrow-forward" size={20} color="#244630" /></View></Pressable><Pressable style={authStyles.changeNumber} onPress={() => { setOtpRequested(false); setOtp(''); }}><Text style={authStyles.resendText}>Change phone number</Text></Pressable></>}
          {!!authError && <Text style={styles.authError}>{authError}</Text>}
        </View>
        <Text style={authStyles.privacy}><Icon name="lock-closed-outline" size={12} /> Your number stays private. Standard SMS charges may apply.</Text>
        <View style={authStyles.support}><View style={authStyles.supportIcon}><Icon name="call-outline" size={16} color="#244630" /></View><View style={authStyles.supportCopy}><Text style={authStyles.supportTitle}>Need help signing in?</Text><Text style={authStyles.supportMeta}>Call Farmhands support</Text></View><Text style={authStyles.language}>EN · ಕನ್ನಡ</Text></View>
      </ScrollView> : <View style={[styles.shell, isWide && styles.shellWide]}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}><Icon name="leaf" size={21} color="#F6F1E8" /></View>
            <View><Text style={styles.brand}>farmhands</Text><Text style={styles.brandSub}>LOCAL WORK. STRONGER FARMS.</Text></View>
          </View>
          <Pressable style={styles.profileButton} accessibilityLabel="Open profile"><Text style={styles.profileInitial}>R</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === 'home' && <>
            <View style={networkStyles.greeting}><Text style={networkStyles.heading}>Local network</Text><Text style={networkStyles.subheading}>Nearby work, ready hands.</Text></View>
            <View style={networkTabStyles.networkTabs} accessibilityRole="tablist">
              <Pressable style={[networkTabStyles.networkTab, networkTab === 'requests' && networkTabStyles.networkTabActive]} onPress={() => setNetworkTab('requests')} accessibilityRole="tab" accessibilityState={{ selected: networkTab === 'requests' }}>
                <Text style={[networkTabStyles.networkTabLabel, networkTab === 'requests' && networkTabStyles.networkTabLabelActive]}>Farmer requests</Text>
              </Pressable>
              <Pressable style={[networkTabStyles.networkTab, networkTab === 'labour' && networkTabStyles.networkTabActive]} onPress={() => setNetworkTab('labour')} accessibilityRole="tab" accessibilityState={{ selected: networkTab === 'labour' }}>
                <Text style={[networkTabStyles.networkTabLabel, networkTab === 'labour' && networkTabStyles.networkTabLabelActive]}>Labour available</Text>
              </Pressable>
            </View>
            {networkTab === 'requests' ? <>
              <View style={networkStyles.sectionHeader}><Text style={networkStyles.sectionTitle}>Open farmer requests</Text><View style={networkStyles.activeCount}><Text style={networkStyles.activeCountText}>{requests.length} ACTIVE</Text></View></View>
              {!!requestsError && <Text style={styles.authError}>{requestsError}</Text>}
              {!requestsLoading && !requestsError && requests.length === 0 && <Text style={styles.sectionMeta}>No requests yet. Post the first one when a crew is needed.</Text>}
              {requests.map((request) => <RequestCard key={request.id} request={request} />)}
            </> : <>
              <View style={networkStyles.sectionHeader}><View><Text style={networkStyles.sectionTitle}>Labour groups near you</Text><Text style={networkStyles.sectionMeta}>Availability from local crews</Text></View></View>
              <Pressable style={styles.filterRow} onPress={() => setAvailabilityOnly(!availabilityOnly)}><View style={[styles.checkbox, availabilityOnly && styles.checkboxOn]}>{availabilityOnly && <Icon name="checkmark" size={14} color="#F6F1E8" />}</View><Text style={styles.filterText}>Show available now</Text><Text style={styles.filterCount}>{visibleGroups.length} groups</Text></Pressable>
              {visibleGroups.map((group) => <GroupCard key={group.id} group={group} />)}
            </>}
          </>}

          {tab === 'post' && <>
            <View style={styles.greeting}><Text style={styles.eyebrow}>NEW REQUEST</Text><Text style={styles.heading}>Bring in a good crew</Text><Text style={styles.subheading}>Tell nearby groups what you need. They can respond with their availability.</Text></View>
            <NewRequestScreen onPublish={publishRequest} />
          </>}

        </ScrollView>

        <View style={fixedActionStyles.footer}>
          {tab === 'home' ? <Pressable style={fixedActionStyles.cta} onPress={() => setTab('post')} accessibilityRole="button">
            <View style={fixedActionStyles.plus}><Icon name="add" size={22} color="#244630" /></View>
            <View style={fixedActionStyles.ctaCopy}><Text style={fixedActionStyles.ctaTitle}>Post a new request</Text><Text style={fixedActionStyles.ctaSubtitle}>Find nearby farmhands</Text></View>
            <View style={fixedActionStyles.arrow}><Icon name="arrow-forward" size={19} color="#244630" /></View>
          </Pressable> : <Pressable style={fixedActionStyles.backButton} onPress={() => setTab('home')} accessibilityRole="button"><Icon name="arrow-back" size={18} color="#244630" /><Text style={fixedActionStyles.backText}>Back to local network</Text></Pressable>}
        </View>
      </View>}
    </SafeAreaView>
  );
}

function RequestCard({ request }: { request: LabourRequest }) {
  const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const dates = `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;
  return <View style={networkStyles.requestCard}>
    <View style={networkStyles.requestTop}>
      <View style={networkStyles.cropMark}><Icon name="leaf-outline" size={17} color="#244630" /></View>
      <View style={networkStyles.requestTitle}><Text style={networkStyles.cardTitle} numberOfLines={1}>{request.title}</Text><Text style={networkStyles.cardMeta} numberOfLines={1}>{request.area}</Text></View>
      <View style={networkStyles.openBadge}><Text style={networkStyles.openText}>{request.status.toUpperCase()}</Text></View>
    </View>
    <View style={networkStyles.requestBottom}>
      <View style={networkStyles.detail}><Icon name="calendar-outline" size={12} color="#667266" /><Text style={networkStyles.detailText}>{dates}</Text></View>
      <View style={networkStyles.detail}><Icon name="people-outline" size={12} color="#667266" /><Text style={networkStyles.detailText}>{request.peopleNeeded} people</Text></View>
      <Text style={networkStyles.detailStrong}>₹{request.payPerDay} / day</Text>
      <View style={networkStyles.requestArrow}><Icon name="arrow-forward" size={13} color="#244630" /></View>
    </View>
  </View>;
}

function GroupCard({ group, compact = false }: { group: Group; compact?: boolean }) {
  return <View style={[styles.groupCard, compact && styles.groupCardCompact]}><View style={[styles.groupAvatar, { backgroundColor: group.color }]}><Icon name="people" size={22} color="#53634B" /></View><View style={styles.groupBody}><View style={styles.groupNameRow}><Text style={styles.cardTitle}>{group.name}</Text><View style={[styles.availabilityDot, { backgroundColor: group.available ? '#6B9D61' : '#B0AFA5' }]} /></View><Text style={styles.cardMeta}>{group.area} · {group.members} members</Text><Text style={styles.skills}>{group.skills.join('  ·  ')}</Text><Text style={[styles.availability, !group.available && styles.unavailable]}>{group.nextDate}</Text></View><Pressable style={styles.chevron}><Icon name="chevron-forward" size={19} color="#9B9E94" /></Pressable></View>;
}

const networkTabStyles = StyleSheet.create({
  networkTabs: { flexDirection: 'row', backgroundColor: '#EAE6DC', borderRadius: 8, padding: 4, gap: 4, marginBottom: 22 },
  networkTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingHorizontal: 8 },
  networkTabActive: { backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#ECE7DD' },
  networkTabLabel: { color: '#777D70', fontSize: 13, fontWeight: '700' },
  networkTabLabelActive: { color: '#244630' },
});

const fixedActionStyles = StyleSheet.create({
  footer: { backgroundColor: '#F4F1E8', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  cta: { height: 58, borderRadius: 12, backgroundColor: '#173D2A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 10 },
  plus: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#B9D66A', alignItems: 'center', justifyContent: 'center' },
  ctaCopy: { flex: 1 },
  ctaTitle: { color: '#FFFDF8', fontSize: 14, fontWeight: '800' },
  ctaSubtitle: { color: '#C5D2C4', fontSize: 10, marginTop: 2 },
  arrow: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#F0B43D', alignItems: 'center', justifyContent: 'center' },
  backButton: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  backText: { color: '#244630', fontSize: 13, fontWeight: '700' },
});

const authStyles = StyleSheet.create({
  authScroll: { flex: 1, backgroundColor: '#F4F3E9' },
  authScreen: { width: '100%', maxWidth: 500, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 20 },
  authHeader: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  helpChip: { height: 30, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#FFFDF8', flexDirection: 'row', alignItems: 'center', gap: 5 },
  helpText: { color: '#244630', fontSize: 11, fontWeight: '700' },
  hero: { height: 184, borderRadius: 14, overflow: 'hidden', backgroundColor: '#35543D', justifyContent: 'flex-end', marginBottom: 18 },
  heroImage: { borderRadius: 14 },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 35, 22, 0.48)' },
  heroContent: { padding: 16 },
  nearbyBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255, 253, 248, 0.92)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#75A65B' },
  nearbyText: { color: '#244630', fontSize: 9, fontWeight: '800' },
  heroTitle: { color: '#FFFDF8', fontSize: 24, lineHeight: 27, fontWeight: '800', maxWidth: 275 },
  heroSubtitle: { color: '#F1F2E9', fontSize: 11, marginTop: 5 },
  authCopy: { marginBottom: 12 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  authHeading: { color: '#173D2A', fontSize: 22, lineHeight: 27, fontWeight: '800', flexShrink: 1 },
  stepChip: { color: '#765616', backgroundColor: '#F4E7BD', overflow: 'hidden', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: '800' },
  authSubheading: { color: '#677166', fontSize: 11, lineHeight: 16, marginTop: 4 },
  authForm: { backgroundColor: 'transparent' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  formLabel: { color: '#344636', fontSize: 11, fontWeight: '800' },
  codeHint: { color: '#608254', fontSize: 9, fontWeight: '800' },
  phoneInputRow: { minHeight: 48, backgroundColor: '#FFFDF8', borderRadius: 9, borderWidth: 1, borderColor: '#E5E2D8', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 12 },
  countryCode: { color: '#344636', fontSize: 12, fontWeight: '700', paddingRight: 10, borderRightWidth: 1, borderRightColor: '#E5E2D8' },
  phoneInput: { flex: 1, height: 46, paddingHorizontal: 10, color: '#173D2A', fontSize: 14, fontWeight: '700' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginTop: 2 },
  otpCell: { width: 42, minWidth: 0, height: 47, flexGrow: 0, flexShrink: 0, textAlign: 'center', color: '#173D2A', fontSize: 18, fontWeight: '800', backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#E5E2D8', borderRadius: 9 },
  otpCellFilled: { borderColor: '#638C58', backgroundColor: '#FBFCF7' },
  resendRow: { alignItems: 'flex-end', paddingVertical: 8 },
  resendText: { color: '#667266', fontSize: 9, fontWeight: '600' },
  publishButton: { minHeight: 54, backgroundColor: '#173D2A', borderRadius: 11, flexDirection: 'row', alignItems: 'center', padding: 5, gap: 9 },
  buttonShield: { width: 40, height: 40, borderRadius: 9, backgroundColor: '#C6DA7A', alignItems: 'center', justifyContent: 'center' },
  buttonCopy: { flex: 1 },
  publishText: { color: '#FFFDF8', fontSize: 13, fontWeight: '800' },
  buttonSub: { color: '#C5D2C4', fontSize: 9, marginTop: 2 },
  buttonArrow: { width: 40, height: 40, borderRadius: 9, backgroundColor: '#F0B43D', alignItems: 'center', justifyContent: 'center' },
  changeNumber: { alignItems: 'center', marginTop: 9 },
  privacy: { color: '#777D70', fontSize: 9, textAlign: 'center', marginTop: 12 },
  support: { minHeight: 46, backgroundColor: '#E2E9D5', borderRadius: 9, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, marginTop: 18, gap: 8 },
  supportIcon: { width: 29, height: 29, borderRadius: 8, backgroundColor: '#FFFDF8', alignItems: 'center', justifyContent: 'center' },
  supportCopy: { flex: 1 },
  supportTitle: { color: '#344636', fontSize: 9, fontWeight: '800' },
  supportMeta: { color: '#777D70', fontSize: 8, marginTop: 2 },
  language: { color: '#53634B', fontSize: 8, fontWeight: '800' },
});

const networkStyles = StyleSheet.create({
  greeting: { marginBottom: 18 },
  heading: { color: '#173D2A', fontSize: 23, lineHeight: 28, fontWeight: '700' },
  subheading: { color: '#687266', fontSize: 11, marginTop: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, marginTop: 0 },
  sectionTitle: { color: '#244630', fontSize: 13, fontWeight: '700' },
  sectionMeta: { color: '#92968B', fontSize: 10, marginTop: 3 },
  activeCount: { backgroundColor: '#F2E6BF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  activeCountText: { color: '#765616', fontSize: 8, fontWeight: '800' },
  requestCard: { backgroundColor: '#FFFDF8', borderRadius: 11, paddingHorizontal: 10, paddingTop: 9, paddingBottom: 7, marginBottom: 9, shadowColor: '#37452E', shadowOpacity: 0.09, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  requestTop: { flexDirection: 'row', alignItems: 'center', minHeight: 35 },
  cropMark: { width: 31, height: 31, borderRadius: 9, backgroundColor: '#DFE9D3', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  requestTitle: { flex: 1, minWidth: 0 },
  cardTitle: { color: '#344636', fontSize: 11, fontWeight: '800' },
  cardMeta: { color: '#858D80', fontSize: 9, marginTop: 2 },
  openBadge: { backgroundColor: '#E5EFDE', borderRadius: 5, paddingVertical: 3, paddingHorizontal: 6, marginLeft: 5 },
  openText: { color: '#527A48', fontSize: 7, fontWeight: '800' },
  requestBottom: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0ECE3', marginTop: 7, paddingTop: 7, gap: 8 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  detailText: { color: '#777D70', fontSize: 8 },
  detailStrong: { color: '#244630', fontSize: 8, fontWeight: '800', marginLeft: 'auto' },
  requestArrow: { width: 23, height: 23, borderRadius: 7, backgroundColor: '#F2E7C1', alignItems: 'center', justifyContent: 'center' },
});

const styles = StyleSheet.create({
  authScreen: { flex: 1, padding: 28, justifyContent: 'center' }, authBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, position: 'absolute', top: 34, left: 28 }, authBrandText: { color: '#244630', fontSize: 21, fontWeight: '800' }, authCopy: { marginBottom: 26 }, authHeading: { color: '#244630', fontSize: 32, lineHeight: 37, fontWeight: '800' }, authSubheading: { color: '#697064', fontSize: 15, lineHeight: 22, marginTop: 10 }, authForm: { backgroundColor: '#FFFDF8', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#ECE7DD' }, changeNumber: { alignItems: 'center', marginTop: 17 }, authError: { color: '#A44E43', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 14 }, authHint: { color: '#9B9E94', fontSize: 11, textAlign: 'center', marginTop: 20 },
  safe: { flex: 1, backgroundColor: '#F6F1E8' }, shell: { flex: 1 }, shellWide: { maxWidth: 920, alignSelf: 'center', width: '100%' }, header: { height: 78, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E8E2D7' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#244630', alignItems: 'center', justifyContent: 'center' }, brand: { color: '#244630', fontSize: 21, fontWeight: '800', letterSpacing: -0.5 }, brandSub: { color: '#9B9E94', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginTop: 1 }, profileButton: { width: 37, height: 37, borderRadius: 20, backgroundColor: '#E2DACB', alignItems: 'center', justifyContent: 'center' }, profileInitial: { color: '#53634B', fontSize: 15, fontWeight: '700' }, content: { paddingHorizontal: 24, paddingTop: 33, paddingBottom: 35 }, greeting: { marginBottom: 24 }, eyebrow: { color: '#8E7650', fontSize: 11, letterSpacing: 1.5, fontWeight: '800', marginBottom: 8 }, heading: { color: '#244630', fontSize: 31, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 }, subheading: { color: '#697064', fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 560 }, primaryCta: { backgroundColor: '#C9DDAE', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }, ctaLabel: { color: '#244630', fontSize: 19, fontWeight: '800' }, ctaSub: { color: '#53634B', fontSize: 13, marginTop: 5 }, ctaIcon: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#E4EFD4', alignItems: 'center', justifyContent: 'center' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 13, marginTop: 4 }, sectionTitle: { color: '#244630', fontSize: 18, fontWeight: '800' }, sectionMeta: { color: '#92968B', fontSize: 12, marginTop: 4 }, link: { color: '#8E7650', fontWeight: '700', fontSize: 13, paddingBottom: 2 }, requestCard: { backgroundColor: '#FFFDF8', borderRadius: 14, padding: 16, marginBottom: 11, borderWidth: 1, borderColor: '#ECE7DD' }, requestTop: { flexDirection: 'row', alignItems: 'center' }, cropMark: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#E5EEDB', alignItems: 'center', justifyContent: 'center', marginRight: 11 }, requestTitle: { flex: 1 }, cardTitle: { color: '#344636', fontSize: 15, fontWeight: '800' }, cardMeta: { color: '#92968B', fontSize: 12, marginTop: 4 }, openBadge: { backgroundColor: '#E6F0DF', borderRadius: 5, paddingVertical: 4, paddingHorizontal: 7 }, openText: { color: '#608254', fontSize: 9, letterSpacing: 0.7, fontWeight: '800' }, requestDetails: { flexDirection: 'row', gap: 14, borderTopWidth: 1, borderTopColor: '#F0ECE3', marginTop: 15, paddingTop: 12, alignItems: 'center' }, detail: { color: '#777D70', fontSize: 11 }, detailStrong: { color: '#53634B', fontSize: 11, fontWeight: '800', marginLeft: 'auto' }, interest: { color: '#8E7650', fontSize: 11, marginTop: 12, fontWeight: '700' }, groupScroll: { gap: 11, paddingBottom: 4 }, groupCard: { backgroundColor: '#FFFDF8', borderRadius: 14, padding: 15, marginBottom: 11, borderWidth: 1, borderColor: '#ECE7DD', flexDirection: 'row', alignItems: 'flex-start' }, groupCardCompact: { width: 310, marginBottom: 0 }, groupAvatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, groupBody: { flex: 1 }, groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, availabilityDot: { width: 7, height: 7, borderRadius: 4 }, skills: { color: '#8E7650', fontSize: 11, marginTop: 7 }, availability: { color: '#65905C', fontSize: 11, fontWeight: '700', marginTop: 8 }, unavailable: { color: '#9B9E94' }, chevron: { padding: 3 }, formCard: { backgroundColor: '#FFFDF8', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#ECE7DD' }, formLabel: { color: '#53634B', fontSize: 12, fontWeight: '800', marginBottom: 7, marginTop: 5 }, input: { height: 47, borderWidth: 1, borderColor: '#DEDACF', borderRadius: 9, paddingHorizontal: 13, color: '#344636', fontSize: 14, backgroundColor: '#FFFEFA', marginBottom: 11 }, formRow: { flexDirection: 'row', gap: 12 }, formHalf: { flex: 1 }, inputButton: { height: 47, borderWidth: 1, borderColor: '#DEDACF', borderRadius: 9, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 17 }, inputButtonText: { flex: 1, color: '#9B9E94', fontSize: 14 }, selectedDate: { color: '#344636', fontWeight: '700' }, datePickerBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)', justifyContent: 'flex-end' }, datePickerSheet: { backgroundColor: '#FFFDF8', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 }, datePickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, datePickerAction: { color: '#9B9E94', fontSize: 14, fontWeight: '700' }, datePickerActionText: { color: '#244630' }, publishButton: { backgroundColor: '#244630', height: 51, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 }, publishText: { color: '#F6F1E8', fontSize: 15, fontWeight: '800' }, formHint: { color: '#9B9E94', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 13 }, filterRow: { height: 50, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E8E2D7', flexDirection: 'row', alignItems: 'center', marginBottom: 16 }, checkbox: { width: 19, height: 19, borderRadius: 5, borderWidth: 1.5, borderColor: '#AEB6A3', alignItems: 'center', justifyContent: 'center', marginRight: 9 }, checkboxOn: { backgroundColor: '#536F4D', borderColor: '#536F4D' }, filterText: { color: '#53634B', fontSize: 13, fontWeight: '700' }, filterCount: { color: '#9B9E94', fontSize: 12, marginLeft: 'auto' }, tabBar: { height: 77, backgroundColor: '#FFFDF8', borderTopWidth: 1, borderTopColor: '#E8E2D7', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 }, tab: { alignItems: 'center', minWidth: 78 }, tabLabel: { color: '#9B9E94', fontSize: 11, fontWeight: '700', marginTop: 5 }, tabLabelActive: { color: '#244630' }
});
