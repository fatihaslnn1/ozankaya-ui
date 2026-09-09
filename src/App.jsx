import React, { useState, useEffect } from 'react';
import * as signalR from '@microsoft/signalr';

const API_URL = "https://ozankaya-api.onrender.com/api/appointments";
const HUB_URL = "https://ozankaya-api.onrender.com/appointmentHub";

const barbers = [
  { id: 1, name: "Ozan KAYA", title: "Baş Tasarımcı & Usta Berber", chair: "Koltuk 1" },
  { id: 2, name: "Efehan SAYICI", title: "Saç ve Sakal Stilisti", chair: "Koltuk 2" }
];

const timeSlots = [
  "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", 
  "17:00", "18:00", "19:00", "20:00"
];

export default function App() {
  const [adminBarber, setAdminBarber] = useState(null); 
  const [selectedBarber, setSelectedBarber] = useState(1);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [disabledSlots, setDisabledSlots] = useState([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const isSunday = new Date(selectedDate).getDay() === 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get('admin');

    if (adminParam === 'ozan' || adminParam === '1') {
      localStorage.setItem('adminBarber', '1');
      setAdminBarber(1);
      setSelectedBarber(1);
    } else if (adminParam === 'efehan' || adminParam === '2') {
      localStorage.setItem('adminBarber', '2');
      setAdminBarber(2);
      setSelectedBarber(2);
    } else {
      const savedAdmin = localStorage.getItem('adminBarber');
      if (savedAdmin === '1' || savedAdmin === '2') {
        const bId = parseInt(savedAdmin);
        setAdminBarber(bId);
        setSelectedBarber(bId);
      }
    }
  }, []);

  const fetchSlots = async () => {
    if (isSunday) return; 
    try {
      const res = await fetch(`${API_URL}/slots?barberId=${selectedBarber}&date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        const normalized = data.map(t => typeof t === 'string' ? t.substring(0, 5) : t);
        setDisabledSlots(normalized);
      }
    } catch (err) {
      console.error("Saatler çekilemedi:", err);
    }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetch(API_URL);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (err) {
      console.error("Randevular çekilemedi:", err);
    }
  };

  useEffect(() => {
    fetchSlots();
    if (adminBarber) fetchAppointments();
  }, [selectedBarber, selectedDate, adminBarber]);

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .configureLogging(signalR.LogLevel.Information)
      .withAutomaticReconnect()
      .build();

    connection.start()
      .then(() => {
        connection.on("SlotUpdated", (data) => {
          if (data.barberId === selectedBarber && data.date === selectedDate) {
            const timeFormatted = typeof data.time === 'string' ? data.time.substring(0, 5) : data.time;
            setDisabledSlots(prev => 
              data.isBooked ? [...prev, timeFormatted] : prev.filter(t => t !== timeFormatted)
            );
          }
          if (adminBarber) fetchAppointments();
        });
      })
      .catch(err => console.error("SignalR Bağlantı Hatası:", err));

    return () => {
      connection.stop();
    };
  }, [selectedBarber, selectedDate, adminBarber]);

  const handlePhoneChange = (e) => {
    const onlyNums = e.target.value.replace(/\D/g, ''); 
    if (onlyNums.length <= 10) { 
      setPhone(onlyNums);
    }
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    if (isSunday) { alert("Pazar günleri kapalıyız, lütfen başka bir gün seçin."); return; }
    if (!selectedTime) { alert("Lütfen bir randevu saati seçin."); return; }
    if (!firstName.trim() || !lastName.trim()) { alert("Lütfen adınızı ve soyadınızı eksiksiz girin."); return; }
    
    const phoneRegex = /^5\d{9}$/;
    if (!phoneRegex.test(phone)) {
      alert("Lütfen başında 0 olmadan 10 haneli geçerli bir cep telefonu girin. (Örn: 5551234567)");
      return;
    }

    const payload = {
      barberId: selectedBarber,
      customerName: `${firstName.trim()} ${lastName.trim()}`,
      phone,
      date: selectedDate,
      time: selectedTime,
      services: "Saç & Sakal Tasarımı"
    };

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert("Randevunuz başarıyla oluşturuldu!");
        setFirstName("");
        setLastName("");
        setPhone("");
        setSelectedTime("");
        fetchSlots();
      }
    } catch (err) {
      alert("Randevu oluşturulurken bir hata oluştu.");
    }
  };

  const toggleSlot = async (time) => {
    if (!adminBarber || isSunday) return;

    const isCurrentlyDisabled = disabledSlots.includes(time);

    try {
      if (isCurrentlyDisabled) {
        const resAll = await fetch(API_URL);
        if (resAll.ok) {
          const allAppts = await resAll.json();
          const target = allAppts.find(a => 
            Number(a.barberId) === Number(selectedBarber) && 
            String(a.date).split('T')[0] === String(selectedDate) && 
            String(a.time).substring(0, 5) === time
          );

          if (target) {
            const delRes = await fetch(`${API_URL}/${target.id}`, { method: 'DELETE' });
            if (delRes.ok) {
              fetchSlots();
              fetchAppointments();
              return;
            }
          }
        }
      }

      const formattedTime = time.length === 5 ? `${time}:00` : time;
      const res = await fetch(`${API_URL}/toggle-slot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          barberId: Number(selectedBarber), 
          date: selectedDate, 
          time: formattedTime 
        })
      });

      if (res.ok) {
        fetchSlots();
        if (adminBarber) fetchAppointments();
      }
    } catch (err) {
      console.error("Saat durumu değiştirilemedi:", err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bu randevuyu silmek istediğinize emin misiniz? Saati tekrar boşa çıkarılacak.")) return;
    try {
      const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAppointments();
        fetchSlots();
      }
    } catch (err) {
      alert("Randevu silinirken bir hata oluştu.");
    }
  };

  const handleAccept = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}/accept`, {
        method: 'POST'
      });
      if (response.ok) {
        // SMS alertini sildik, sadece listeyi yeniliyoruz ki aşağıya düşsün
        fetchAppointments();
      } else {
        alert("Randevu kabul edilirken bir hata oluştu.");
      }
    } catch (error) {
      console.error("Hata:", error);
    }
  };

  const filteredAppointments = appointments.filter(a => 
    (!adminBarber || a.barberId === adminBarber) &&
    (a.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
     a.phone.includes(searchTerm) ||
     a.date.includes(searchTerm))
  );

  // Randevuları ikiye bölüyoruz
  const pendingAppointments = filteredAppointments.filter(a => !a.isAccepted);
  const acceptedAppointments = filteredAppointments.filter(a => a.isAccepted);

  return (
    <div style={styles.page}>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade {
            animation: fadeIn 0.6s ease-out forwards;
            opacity: 0;
          }
          .delay-1 { animation-delay: 0.1s; }
          .delay-2 { animation-delay: 0.2s; }
          .delay-3 { animation-delay: 0.3s; }
          
          .phone-hover:hover {
            color: #4f46e5 !important;
            transform: scale(1.05);
          }
        `}
      </style>

      {/* Üst Menü (Navbar) */}
      <nav style={styles.navbar}>
        <div style={styles.navContainer}>
          <div style={styles.logoArea}>
            <img 
              src="/dis-cephe.jpg" 
              alt="Dış Cephe" 
              style={styles.logoThumb} 
            />
            <div>
              <h1 style={styles.logoText}>Ozan Kaya</h1>
              <span style={styles.logoSub}>SAÇ TASARIMI</span>
            </div>
          </div>
          
          <div style={styles.navRight}>
            {adminBarber === 1 && <span style={styles.adminBadge}>Ozan Yönetici Paneli</span>}
            {adminBarber === 2 && <span style={styles.adminBadge}>Efehan Yönetici Paneli</span>}
            <a href="tel:05316687331" className="phone-hover" style={styles.phoneLink}>
              <span style={styles.phoneIcon}>📞</span> 0531 668 73 31
            </a>
          </div>
        </div>
      </nav>

      {/* Ana Konteyner */}
      <div style={styles.container}>
        
        {/* 1. Randevu İşlemleri Kartı */}
        <div className="animate-fade delay-1" style={styles.formContainer}>
          
          {/* Personel Seç */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>KİŞİSEL SEÇİM</h2>
            <div style={styles.barberGrid}>
              {barbers.map(b => (
                <div 
                  key={b.id} 
                  onClick={() => {
                    if (!adminBarber) setSelectedBarber(b.id);
                  }}
                  style={{
                    ...styles.barberCard,
                    ...(selectedBarber === b.id ? styles.barberCardActive : {}),
                    ...(adminBarber ? { cursor: 'default' } : {})
                  }}
                >
                  <div style={styles.barberName}>{b.name}</div>
                  <div style={{...styles.barberTitle, color: selectedBarber === b.id ? '#4f46e5' : '#64748b'}}>{b.title}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tarih Seç */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>TARİH SEÇ</h2>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedTime(""); 
              }} 
              style={styles.dateInput}
            />
          </div>

          {/* Saat Seç */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>SAAT SEÇ</h2>
            
            {isSunday ? (
              <div style={styles.sundayWarning}>
                <h3 style={{margin: '0 0 10px 0'}}>Pazar Günleri Kapalıyız</h3>
                <p style={{margin: 0}}>Lütfen hizmet almak için farklı bir gün seçin.</p>
              </div>
            ) : (
              <div style={styles.slotGrid}>
                {timeSlots.map(time => {
                  const isDisabled = disabledSlots.includes(time);
                  const isSelected = selectedTime === time;

                  let slotStyle = styles.slotBtn;
                  if (isDisabled) slotStyle = styles.slotDisabled;
                  else if (isSelected) slotStyle = styles.slotSelected;

                  return (
                    <button
                      key={time}
                      onClick={() => adminBarber ? toggleSlot(time) : setSelectedTime(time)}
                      disabled={!adminBarber && isDisabled}
                      style={slotStyle}
                    >
                      <span style={{ fontSize: '15px' }}>{time}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* 2. Randevu Bilgileri Formu */}
        {!adminBarber && !isSunday && (
          <div className="animate-fade delay-2" style={styles.formContainer}>
            <h2 style={{...styles.sectionTitle, marginBottom: '20px', textAlign: 'center'}}>RANDEVU BİLGİLERİ</h2>
            <form onSubmit={handleBooking} style={styles.form}>
              <div style={styles.formRow}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Adınız</label>
                  <input 
                    type="text" 
                    placeholder="Adınızı giriniz" 
                    value={firstName} 
                    onChange={e => setFirstName(e.target.value)} 
                    style={styles.input}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>Soyadınız</label>
                  <input 
                    type="text" 
                    placeholder="Soyadınızı giriniz" 
                    value={lastName} 
                    onChange={e => setLastName(e.target.value)} 
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Telefon Numarası</label>
                <input 
                  type="text" 
                  placeholder="Telefon numaranızı giriniz (Örn: 5551234567)" 
                  value={phone} 
                  onChange={handlePhoneChange} 
                  style={styles.input}
                />
              </div>

              <button type="submit" style={styles.submitBtn}>
                Randevu Al {selectedTime && `(${selectedTime})`}
              </button>
            </form>
          </div>
        )}

        {/* 3. İç Mekan Resmi */}
        <div className="animate-fade delay-3" style={styles.midBannerWrapper}>
          <img 
            src="/salon-ic.jpg" 
            alt="Salon İç Mekan" 
            style={styles.midBannerImage} 
          />
          <div style={styles.imageOverlayText}>
            <span style={styles.overlaySubtitle}>LÜKS DENEYİM</span>
            <h3 style={styles.overlayTitle}>Bu Salon Tutkunuz Olacak</h3>
          </div>
        </div>

        {/* Admin Paneli */}
        {adminBarber && (
          <div className="animate-fade delay-3" style={styles.adminCard}>
            <div style={styles.adminHeader}>
              <h2 style={{...styles.sectionTitle, margin: 0, textAlign: 'center'}}>
                {adminBarber === 1 ? 'Ozan Kaya - Yönetici Paneli' : 'Efehan Sayıcı - Yönetici Paneli'}
              </h2>
            </div>
            
            {/* YENİ GELEN RANDEVULAR TABLOSU */}
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ color: '#f59e0b', fontSize: '16px', marginBottom: '15px', borderBottom: '2px solid #fef3c7', paddingBottom: '10px' }}>
                 Yeni Gelen Randevular
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Berberi</th>
                      <th style={styles.th}>Müşteri</th>
                      <th style={styles.th}>Telefon</th>
                      <th style={styles.th}>Tarih ve Saat</th>
                      <th style={{...styles.th, textAlign: 'center'}}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAppointments.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{...styles.td, textAlign: 'center', color: '#94a3b8'}}>
                          Bekleyen yeni randevu bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      pendingAppointments.map(a => (
                        <tr key={a.id} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={styles.barberTag}>
                              {a.barberId === 1 ? 'Ozan' : 'Efehan'}
                            </span>
                          </td>
                          <td style={{...styles.td, fontWeight: '600'}}>{a.customerName}</td>
                          <td style={styles.td}>{a.phone}</td>
                          <td style={styles.td}>{a.date} - <strong style={{color: '#4f46e5'}}>{a.time}</strong></td>
                          <td style={{...styles.td, textAlign: 'center'}}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <a href={`tel:${a.phone}`} style={styles.callBtn} title="Ara">Ara</a>
                              <button 
                                onClick={() => handleAccept(a.id)} 
                                style={{ backgroundColor: '#2563eb', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}
                              >
                                Kabul Et
                              </button>
                              <button onClick={() => handleDelete(a.id)} style={styles.deleteBtn} title="İptal">Sil</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* KABUL EDİLEN RANDEVULAR TABLOSU */}
            <div>
              <h3 style={{ color: '#10b981', fontSize: '16px', marginBottom: '15px', borderBottom: '2px solid #d1fae5', paddingBottom: '10px' }}>
                 Kabul Edilen Randevular
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Berberi</th>
                      <th style={styles.th}>Müşteri</th>
                      <th style={styles.th}>Telefon</th>
                      <th style={styles.th}>Tarih ve Saat</th>
                      <th style={{...styles.th, textAlign: 'center'}}>Durum / İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptedAppointments.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{...styles.td, textAlign: 'center', color: '#94a3b8'}}>
                          Henüz onaylanmış randevu bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      acceptedAppointments.map(a => (
                        <tr key={a.id} style={styles.tr}>
                          <td style={styles.td}>
                            <span style={styles.barberTag}>
                              {a.barberId === 1 ? 'Ozan' : 'Efehan'}
                            </span>
                          </td>
                          <td style={{...styles.td, fontWeight: '600'}}>{a.customerName}</td>
                          <td style={styles.td}>{a.phone}</td>
                          <td style={styles.td}>{a.date} - <strong style={{color: '#4f46e5'}}>{a.time}</strong></td>
                          <td style={{...styles.td, textAlign: 'center'}}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                              <span style={{ backgroundColor: '#d1fae5', color: '#047857', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>
                                ONAYLANDI
                              </span>
                              <a href={`tel:${a.phone}`} style={styles.callBtn} title="Ara">Ara</a>
                              <button onClick={() => handleDelete(a.id)} style={styles.deleteBtn} title="İptal">Sil</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  page: {
    backgroundColor: '#f8fafc', 
    color: '#334155', 
    minHeight: '100vh',
    paddingBottom: '80px',
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  navbar: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    padding: '12px 0',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
  },
  navContainer: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '0 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoThumb: {
    width: '45px',
    height: '45px',
    borderRadius: '8px',
    objectFit: 'cover',
    border: '1px solid #cbd5e1',
  },
  logoText: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: '-0.5px',
    lineHeight: '1.1',
  },
  logoSub: {
    fontSize: '10px',
    color: '#64748b',
    letterSpacing: '1.5px',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  phoneLink: {
    textDecoration: 'none',
    color: '#4f46e5', 
    fontSize: '16px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.3s ease',
  },
  phoneIcon: {
    fontSize: '16px',
  },
  adminBadge: {
    background: '#fee2e2',
    color: '#ef4444',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '30px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '25px',
  },
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    padding: '35px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
    border: '1px solid #f1f5f9',
  },
  midBannerWrapper: {
    width: '100%',
    height: '380px',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-end',
  },
  midBannerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
  },
  imageOverlayText: {
    position: 'relative',
    zIndex: 2,
    background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
    width: '100%',
    padding: '30px 35px',
    boxSizing: 'border-box',
  },
  overlaySubtitle: {
    color: '#f59e0b',
    fontSize: '12px',
    fontWeight: '800',
    letterSpacing: '2px',
    display: 'block',
    marginBottom: '6px',
  },
  overlayTitle: {
    color: '#ffffff',
    margin: 0,
    fontSize: '26px',
    fontWeight: '700',
    textShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  section: {
    marginBottom: '30px',
  },
  sectionTitle: {
    fontSize: '13px',
    color: '#475569',
    marginBottom: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    textAlign: 'center',
  },
  barberGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
  },
  barberCard: {
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    padding: '18px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center',
  },
  barberCardActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff', 
    boxShadow: '0 4px 15px rgba(79, 70, 229, 0.15)',
  },
  barberName: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: '4px',
  },
  barberTitle: {
    fontSize: '12px',
  },
  dateInput: {
    width: '100%',
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    color: '#0f172a',
    padding: '14px 20px',
    borderRadius: '12px',
    fontSize: '15px',
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  slotGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    gap: '12px',
  },
  slotBtn: {
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    color: '#334155',
    padding: '14px 10px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  slotSelected: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
    color: '#ffffff',
    padding: '14px 10px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: '700',
    boxShadow: '0 6px 15px rgba(79, 70, 229, 0.25)',
  },
  slotDisabled: {
    backgroundColor: '#f1f5f9',
    border: '2px solid #e2e8f0',
    color: '#cbd5e1',
    padding: '14px 10px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: '600',
    textDecoration: 'line-through',
  },
  sundayWarning: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#ef4444',
    padding: '20px',
    borderRadius: '12px',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formRow: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  inputGroup: {
    flex: '1 1 200px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#ffffff',
    border: '2px solid #e2e8f0',
    color: '#0f172a',
    padding: '14px',
    borderRadius: '10px',
    fontSize: '14px',
    outline: 'none',
  },
  submitBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366f1', 
    color: '#ffffff',
    border: 'none',
    padding: '14px 30px',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 8px 15px rgba(99, 102, 241, 0.2)',
  },
  adminCard: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    padding: '30px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
    border: '1px solid #e2e8f0',
  },
  adminHeader: {
    marginBottom: '20px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  th: {
    borderBottom: '2px solid #e2e8f0',
    padding: '15px 12px',
    color: '#64748b',
    fontSize: '12px',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  td: {
    padding: '16px 12px',
    borderBottom: '1px solid #f1f5f9',
    fontSize: '14px',
    color: '#334155',
  },
  tr: {
    transition: 'background-color 0.2s',
  },
  barberTag: {
    backgroundColor: '#e0e7ff',
    color: '#4f46e5',
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
  },
  callBtn: {
    backgroundColor: '#10b981',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '12px',
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    color: '#ef4444',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: '700',
  }
};