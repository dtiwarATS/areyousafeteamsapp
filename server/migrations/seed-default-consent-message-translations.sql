-- Seed defaultConsentMessage for User Consent Configure default text
-- Tables: SYS_ATTRIBUTE_DEF + SYS_ATTRIBUTE_DEF_TRANS
-- Safe to re-run (idempotent MERGE).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRAN;

DECLARE @AttributeNames TABLE (AttributeName NVARCHAR(256) NOT NULL PRIMARY KEY);
INSERT INTO @AttributeNames (AttributeName) VALUES (N'defaultConsentMessage');

INSERT INTO SYS_ATTRIBUTE_DEF (ATTRIBUTE)
SELECT a.AttributeName
FROM @AttributeNames a
WHERE NOT EXISTS (
  SELECT 1 FROM SYS_ATTRIBUTE_DEF sa WHERE sa.ATTRIBUTE = a.AttributeName
);

DECLARE @SourceRows TABLE (
  AttributeName NVARCHAR(256) NOT NULL,
  LanguageId INT NOT NULL,
  TranslatedAttribute NVARCHAR(MAX) NOT NULL
);

INSERT INTO @SourceRows (AttributeName, LanguageId, TranslatedAttribute) VALUES
  (N'defaultConsentMessage', 10000, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10001, N'En cliquant sur Envoyer, je consens à recevoir les notifications de contrôle de sécurité via les canaux de notification sélectionnés.'),
  (N'defaultConsentMessage', 10002, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10003, N'بالنقر على إرسال، أوافق على تلقي إشعارات فحص السلامة من خلال قنوات الإشعار المختارة.'),
  (N'defaultConsentMessage', 10004, N'С натискане на Изпрати се съгласявам да получавам известия за Проверка на безопасността чрез избраните канали за известия.'),
  (N'defaultConsentMessage', 10005, N'En fer clic a Enviar, consento a rebre notificacions de comprovació de seguretat a través dels canals de notificació seleccionats.'),
  (N'defaultConsentMessage', 10006, N'点击提交，即表示我同意通过所选通知渠道接收安全检查通知。'),
  (N'defaultConsentMessage', 10007, N'點擊「提交」即表示我同意透過所選通知管道接收安全檢查通知。'),
  (N'defaultConsentMessage', 10008, N'Klikom na Pošalji, pristajem primati obavijesti o Safety Checku putem odabranih kanala obavijesti.'),
  (N'defaultConsentMessage', 10009, N'Kliknutím na Odeslat souhlasím s přijímáním oznámení o Safety Check prostřednictvím vybraných kanálů oznámení.'),
  (N'defaultConsentMessage', 10010, N'Ved at klikke på Send giver jeg samtykke til at modtage Safety Check-notifikationer via de valgte notifikationskanaler.'),
  (N'defaultConsentMessage', 10011, N'Door op Verzenden te klikken, geef ik toestemming om Safety Check-meldingen te ontvangen via de geselecteerde meldingskanalen.'),
  (N'defaultConsentMessage', 10012, N'Klõpsates Esita, nõustun saama Safety Check teavitused valitud teavituskanalite kaudu.'),
  (N'defaultConsentMessage', 10013, N'Klikkaamalla Lähetä, suostun vastaanottamaan Safety Check -ilmoituksia valittujen ilmoituskanavien kautta.'),
  (N'defaultConsentMessage', 10014, N'En cliquant sur Envoyer, je consens à recevoir des notifications de vérification de sécurité via les canaux de notification sélectionnés.'),
  (N'defaultConsentMessage', 10015, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10016, N'Κάνοντας κλικ στην Υποβολή, συναινώ να λαμβάνω ειδοποιήσεις Safety Check μέσω των επιλεγμένων καναλιών ειδοποιήσεων.'),
  (N'defaultConsentMessage', 10017, N'בלחיצה על שלח, אני מסכים לקבל התראות בדיקת בטיחות דרך ערוצי ההתראות שנבחרו.'),
  (N'defaultConsentMessage', 10018, N'सबमिट पर क्लिक करके, मैं चयनित अधिसूचना चैनलों के माध्यम से सुरक्षा जांच सूचनाएं प्राप्त करने के लिए सहमति देता हूं।'),
  (N'defaultConsentMessage', 10019, N'A Küldés gombra kattintva hozzájárulok a Biztonsági Ellenőrzés értesítések megszerzéséhez a kiválasztott értesítési csatornákon keresztül.'),
  (N'defaultConsentMessage', 10020, N'Dengan mengklik Kirim, saya setuju untuk menerima notifikasi Safety Check melalui saluran notifikasi yang dipilih.'),
  (N'defaultConsentMessage', 10021, N'Cliccando su Invia, acconsento a ricevere le notifiche di Safety Check tramite i canali di notifica selezionati.'),
  (N'defaultConsentMessage', 10022, N'送信ボタンをクリックすることで、選択した通知チャネルを通じて安全チェック通知を受け取ることに同意したことになります。'),
  (N'defaultConsentMessage', 10023, N'제출을 클릭함으로써 선택한 알림 채널을 통해 안전 점검 알림을 받는 것에 동의한 것으로 간주됩니다.'),
  (N'defaultConsentMessage', 10024, N'Noklikšķinot uz Iesniegt, es piekrītu saņemt drošības pārbaudes paziņojumus caur izvēlētajiem paziņojumu kanāliem.'),
  (N'defaultConsentMessage', 10025, N'Paspaudęs "Pateikti", sutinku gauti Saugumo patikros pranešimus per pasirinktus pranešimų kanalus.'),
  (N'defaultConsentMessage', 10026, N'Dengan mengklik Hantar, saya bersetuju untuk menerima notifikasi Pemeriksaan Keselamatan melalui saluran pemberitahuan yang dipilih.'),
  (N'defaultConsentMessage', 10027, N'Ved å klikke på Send samtykker jeg til å motta sikkerhetssjekkvarsler gjennom de valgte varslingskanalene.'),
  (N'defaultConsentMessage', 10028, N'Klikając "Wyślij", wyrażam zgodę na otrzymywanie powiadomień Safety Check za pośrednictwem wybranych kanałów powiadomień.'),
  (N'defaultConsentMessage', 10029, N'Ao clicar em Enviar, consinto em receber notificações de Verificação de Segurança pelos canais de notificação selecionados.'),
  (N'defaultConsentMessage', 10030, N'Ao clicar em Enviar, consento em receber notificações de Verificação de Segurança através dos canais de notificação selecionados.'),
  (N'defaultConsentMessage', 10031, N'Prin apăsarea pe Trimite, consimt să primesc notificări de verificare a siguranței prin canalele selectate de notificări.'),
  (N'defaultConsentMessage', 10032, N'Нажав «Отправить», я даю согласие на получение уведомлений о проверке безопасности через выбранные каналы уведомлений.'),
  (N'defaultConsentMessage', 10033, N'Klikom na Pošalji, pristajem na primanje obaveštenja o bezbednosnoj proveri putem odabranih kanala obaveštenja.'),
  (N'defaultConsentMessage', 10034, N'Kliknutím na Odoslať súhlasím s prijímaním upozornení o Safety Check prostredníctvom vybraných upozornených kanálov.'),
  (N'defaultConsentMessage', 10035, N'S klikom na Pošlji soglašam z prejemanjem obvestil Safety Check preko izbranih kanalov obvestil.'),
  (N'defaultConsentMessage', 10036, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10037, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10038, N'Genom att klicka på Skicka samtycker jag till att få säkerhetskontrollaviseringar via de valda notifikationskanalerna.'),
  (N'defaultConsentMessage', 10039, N'โดยการคลิกส่ง ฉันยินยอมรับการแจ้งเตือนการตรวจสอบความปลอดภัยผ่านช่องทางการแจ้งเตือนที่เลือกไว้'),
  (N'defaultConsentMessage', 10040, N'Gönder''e tıklayarak, seçilen bildirim kanalları üzerinden Güvenlik Kontrolü bildirimlerini almaya onay veriyorum.'),
  (N'defaultConsentMessage', 10041, N'Натискаючи «Надіслати», я погоджуюся отримувати сповіщення про перевірку безпеки через вибрані канали сповіщень.'),
  (N'defaultConsentMessage', 10042, N'Bằng cách nhấn Gửi, tôi đồng ý nhận thông báo Kiểm tra An toàn qua các kênh thông báo đã chọn.'),
  (N'defaultConsentMessage', 10043, N'Trwy glicio Cyflwyno, rwy''n cydsynio i dderbyn hysbysiadau Gwiriad Diogelwch trwy''r sianeli hysbysu a ddewiswyd.'),
  (N'defaultConsentMessage', 10044, N'Bidali klik eginez, Segurtasun Egiaztapen jakinarazpenak jasotzeko baimena ematen dut hautatutako jakinarazpen kanalen bidez.'),
  (N'defaultConsentMessage', 10045, N'Ao facer clic en Enviar, consento recibir notificacións de comprobación de seguridade a través dos canais de notificación seleccionados.'),
  (N'defaultConsentMessage', 10046, N'Deur op Stuur te klik, stem ek in om Veiligheidskontrole-kennisgewings deur die gekose kennisgewingkanale te ontvang.'),
  (N'defaultConsentMessage', 10047, N'Duke klikuar Dërgo, unë pranoj të marr njoftime për Kontrollin e Sigurisë përmes kanaleve të zgjedhura të njoftimit.'),
  (N'defaultConsentMessage', 10048, N'Սեղմելով Ներկայացնել՝ ես համաձայն եմ ստանալ անվտանգության ստուգման ծանուցումներ ընտրված ծանուցման ուղիների միջոցով:'),
  (N'defaultConsentMessage', 10049, N'Göndər düyməsini klikləməklə, seçilmiş bildiriş kanalları vasitəsilə Təhlükəsizlik Yoxlaması bildirişlərini almağa razılıq verirəm.'),
  (N'defaultConsentMessage', 10050, N'Націскаючы «Адправіць», я даю згоду атрымліваць апавяшчэнні пра праверку бяспекі праз выбраныя каналы апавяшчэнняў.'),
  (N'defaultConsentMessage', 10051, N'Klikom na Pošalji, pristajem na primanje obavještenja o Safety Check putem odabranih kanala obavještenja.'),
  (N'defaultConsentMessage', 10052, N'Sa pag-click sa Submit, pumapayag akong makatanggap ng Safety Check notifications sa pamamagitan ng napiling notification channels.'),
  (N'defaultConsentMessage', 10053, N'გაგზავნაზე დაწკაპუნებით ვეთანხმები უსაფრთხოების შემოწმების შეტყობინებების მიღებას შერჩეული შეტყობინებების არხების საშუალებით.'),
  (N'defaultConsentMessage', 10054, N'Með því að smella á Senda samþykki ég að fá tilkynningar um öryggisathugun í gegnum valin tilkynningarrásir.'),
  (N'defaultConsentMessage', 10055, N'Trí chliceáil Cuir isteach, toilím fógraí Seiceála Sábháilteachta a fháil trí na bealaí fógra roghnaithe.'),
  (N'defaultConsentMessage', 10056, N'Жіберу батырмасын басу арқылы таңдалған хабарлама арналары арқылы Қауіпсіздік тексеру хабарламаларын алуға келісемін.'),
  (N'defaultConsentMessage', 10057, N'Со кликнување на Испрати, се согласувам да примам известувања за Безбедносна проверка преку избраните канали за известување.'),
  (N'defaultConsentMessage', 10058, N'Илгээх товчийг дарснаар би сонгогдсон мэдэгдлийн сувгуудаар Safety Check мэдэгдэл хүлээн авахыг зөвшөөрч байна.'),
  (N'defaultConsentMessage', 10059, N'با کلیک روی ارسال، موافقت می کنم که اعلان های بررسی ایمنی را از طریق کانال های اعلان انتخاب شده دریافت کنم.'),
  (N'defaultConsentMessage', 10060, N'Kwa kubofya Wasilisha, ninakubali kupokea arifa za Ukaguzi wa Usalama kupitia njia zilizochaguliwa za arifa.'),
  (N'defaultConsentMessage', 10061, N'சமர்ப்பி என்பதைக் கிளிக் செய்வதன் மூலம், தேர்ந்தெடுக்கப்பட்ட அறிவிப்பு சேனல்கள் மூலம் பாதுகாப்புச் சரிபார்ப்பு அறிவிப்புகளைப் பெற நான் ஒப்புக்கொள்கிறேன்.'),
  (N'defaultConsentMessage', 10062, N'సబ్మిట్ క్లిక్ చేయడం ద్వారా, ఎంపిక చేయబడ్డ నోటిఫికేషన్ ఛానల్స్ ద్వారా సేఫ్టీ చెక్ నోటిఫికేషన్ లను అందుకునేందుకు నేను సమ్మతి తెలియజేస్తున్నాను.'),
  (N'defaultConsentMessage', 10063, N'سبمٹ پر کلک کر کے، میں منتخب کردہ نوٹیفکیشن چینلز کے ذریعے سیفٹی چیک کی نوٹیفکیشنز وصول کرنے کی رضامندی دیتا ہوں۔'),
  (N'defaultConsentMessage', 10064, N'Yuborish tugmasini bosib, tanlangan bildirishnoma kanallari orqali Xavfsizlik tekshiruvi bildirishnomalarini olishga rozilik beraman.'),
  (N'defaultConsentMessage', 10065, N'አስገባን ጠቅ በማድረግ በተመረጡት የማሳወቂያ ቻናሎች በኩል የደህንነት ፍተሻ ማሳወቂያዎችን ለመቀበል ተስማምቻለሁ።'),
  (N'defaultConsentMessage', 10066, N'দাখিল কৰক ক্লিক কৰি, মই চয়নিত অধিসূচনা চেনেলসমূহৰ মাধ্যমেৰে সুৰক্ষা পৰীক্ষা অধিসূচনাসমূহ প্ৰাপ্ত কৰিবলৈ সন্মতি জনাইছো।'),
  (N'defaultConsentMessage', 10067, N'জমা দিন ক্লিক করে, আমি নির্বাচিত বিজ্ঞপ্তি চ্যানেলগুলির মাধ্যমে সুরক্ষা পরীক্ষার বিজ্ঞপ্তিগুলি পেতে সম্মত হই।'),
  (N'defaultConsentMessage', 10068, N'Ебәреү кнопкаһына баҫып, һайланған хәбәр каналдары аша Safety Check хәбәрҙәрен алырға ризалашам.'),
  (N'defaultConsentMessage', 10069, N'Við at trýsta á Send, samtykki eg at fáa Safety Check-fráboðanir gjøgnum valdu fráboðanarkanalarnar.'),
  (N'defaultConsentMessage', 10070, N'સબમિટ પર ક્લિક કરીને, હું પસંદ કરેલા નોટિફિકેશન ચેનલ્સ દ્વારા સેફ્ટી ચેક નોટિફિકેશન મેળવવા માટે સંમતિ આપું છું.'),
  (N'defaultConsentMessage', 10071, N'Lè w klike sou Soumèt, mwen dakò pou resevwa notifikasyon Chèk Sekirite atravè chanèl notifikasyon yo chwazi.'),
  (N'defaultConsentMessage', 10072, N'Ta danna Aikawa, na yarda in karɓi sanarwar Binciken Tsaro ta hanyar zaɓaɓɓun tashoshin sanarwar.'),
  (N'defaultConsentMessage', 10073, N'Site na ịpị Nyefee, ekwenyere m ịnata ọkwa Safety Check site na ọwa ọkwa ahọpụtara.'),
  (N'defaultConsentMessage', 10074, N'naqillugu naksiutilugu, angiqpunga piqattarumallunga attarnaqtailimanirmut qaujisarutinik qaujikkaijjutinik niruaqtausimajukkut qaujikkaijjutikkut.'),
  (N'defaultConsentMessage', 10075, N'ಸಲ್ಲಿಸು ಕ್ಲಿಕ್ ಮಾಡುವ ಮೂಲಕ, ಆಯ್ದ ಅಧಿಸೂಚನೆ ಚಾನಲ್ ಗಳ ಮೂಲಕ ಸುರಕ್ಷತಾ ಪರಿಶೀಲನೆ ಅಧಿಸೂಚನೆಗಳನ್ನು ಸ್ವೀಕರಿಸಲು ನಾನು ಸಮ್ಮತಿಸುತ್ತೇನೆ.'),
  (N'defaultConsentMessage', 10076, N'ដោយចុច ដាក់ស្នើ ខ្ញុំយល់ព្រមទទួលការជូនដំណឹងត្រួតពិនិត្យសុវត្ថិភាពតាមរយៈបណ្តាញជូនដំណឹងដែលបានជ្រើស។'),
  (N'defaultConsentMessage', 10077, N'By click Submit, I consent to receive Safety Check notifications through the selected notification channels.'),
  (N'defaultConsentMessage', 10078, N'सबमिट क्लिक करून, हांव वेंचून काडिल्ल्या अधिसुचोवणी चॅनला वरवीं सुरक्षा तपासणी अधिसुचोवणी मेळोवपाक संमती दितां.'),
  (N'defaultConsentMessage', 10079, N'Bi tikandina Bişîne, ez razî me ku bi kanalên agahdariyê yên bijartî agahdariyên Kontrola Ewlehiyê bistînim.'),
  (N'defaultConsentMessage', 10080, N'Жөнөтүү баскычын басып, тандалган кабар каналдары аркылуу Коопсуздук текшерүү билдирүүлөрүн алууга макулмун.'),
  (N'defaultConsentMessage', 10081, N'ໂດຍການກົດສົ່ງ, ຂ້ອຍຍອມຮັບຮັບການແຈ້ງເຕືອນການກວດສອບຄວາມປອດໄພຜ່ານຊ່ອງທາງແຈ້ງເຕືອນທີ່ເລືອກ.'),
  (N'defaultConsentMessage', 10082, N'Na kofina Envoyer, nandimi kozwa banotification ya Safety Check na nzela ya ba canal ya notification oyo eponami.'),
  (N'defaultConsentMessage', 10083, N'Wann ech op Ënnerschreiwen klicken, stëmmen ech zou, Safety Check Notifikatiounen iwwer déi ausgewielte Notifikatiounskanäl ze kréien.'),
  (N'defaultConsentMessage', 10084, N'सबमिट पर क्लिक कऽ, हम चयनित सूचना चैनलक माध्यमसँ सुरक्षा जाँच सूचना प्राप्त करबाक लेल सहमति दैत छी।'),
  (N'defaultConsentMessage', 10085, N'Amin''ny alàlan''ny fanindriana ny Submit dia manaiky ny hahazo fampandrenesana Safety Check amin''ny alàlan''ny fantsona fampandrenesana voafantina aho.'),
  (N'defaultConsentMessage', 10086, N'സമർപ്പിക്കുക ക്ലിക്കുചെയ്യുക വഴി, തിരഞ്ഞെടുത്ത അറിയിപ്പ് ചാനലുകളിലൂടെ സുരക്ഷാ പരിശോധന അറിയിപ്പുകൾ സ്വീകരിക്കുന്നതിന് ഞാൻ സമ്മതിക്കുന്നു.'),
  (N'defaultConsentMessage', 10087, N'Billi nikklikkja fuq Issottometti, naqbel li nirċievi notifiki ta'' Kontroll tas-Sigurtà permezz tal-kanali ta'' notifika magħżula.'),
  (N'defaultConsentMessage', 10088, N'ꯁꯕꯃꯤꯠ ꯀ꯭ꯂꯤꯛ ꯇꯧꯗꯨꯅ, ꯈꯟꯒꯠꯂꯕ ꯅꯣꯇꯤꯐꯤꯀꯦꯁꯟ ꯆꯦꯅꯦꯜꯁꯤꯡꯒꯤ ꯈꯨꯠꯊꯥꯡꯗ ꯁꯦꯐꯇꯤ ꯆꯦꯛ ꯅꯣꯇꯤꯐꯤꯀꯦꯁꯟꯁꯤꯡ ꯐꯪꯅꯕ ꯑꯩꯅ ꯌꯥꯔꯦ꯫'),
  (N'defaultConsentMessage', 10089, N'Mā te pāwhiri i te Tuku, ka whakaae ahau ki te whiwhi whakamōhiotanga Taki Haumaru mā ngā hongere whakamōhiotanga kua tīpakohia.'),
  (N'defaultConsentMessage', 10090, N'सबमिट वर क्लिक करून, मी निवडलेल्या सूचना चॅनेलद्वारे सुरक्षा तपासणी सूचना प्राप्त करण्यास संमती देतो.'),
  (N'defaultConsentMessage', 10091, N'Submit ကိုနှိပ်ခြင်းဖြင့် ရွေးချယ်ထားသော အသိပေးချက်ချန်နယ်များမှတဆင့် လုံခြုံရေးစစ်ဆေးမှု အသိပေးချက်များ လက်ခံရရှိရန် သဘောတူပါသည်။'),
  (N'defaultConsentMessage', 10092, N'सबमिट क्लिक गरेर, म चयन गरिएको सूचना च्यानलहरू मार्फत सुरक्षा जाँच सूचनाहरू प्राप्त गर्न सहमत छु।'),
  (N'defaultConsentMessage', 10093, N'Mwa kuwonekera Tumizani, ndikuvomereza kulandira zidziwitso za Safety Check kudzera mu njira zosankhidwa zodziwitsira.'),
  (N'defaultConsentMessage', 10094, N'ସବମିଟ୍ କ୍ଲିକ୍ କରିବା ଦ୍ୱାରା, ମୁଁ ଚୟନିତ ବିଜ୍ଞପ୍ତି ଚ୍ୟାନେଲଗୁଡିକ ମାଧ୍ୟମରେ ସୁରକ୍ଷା ଯାଞ୍ଚ ବିଜ୍ଞପ୍ତି ପ୍ରାପ୍ତ କରିବାକୁ ସମ୍ମତି ଦେଉଛି।'),
  (N'defaultConsentMessage', 10095, N'د سپارلو په کلیک کولو سره، زه موافقه کوم چې د خوندیتوب چک خبرتیاوې د ټاکل شویو خبرتیا چینلونو له لارې ترلاسه کړم.'),
  (N'defaultConsentMessage', 10096, N'ਸਪੁਰਦ ਕਰੋ ''ਤੇ ਕਲਿੱਕ ਕਰਕੇ, ਮੈਂ ਚੁਣੇ ਗਏ ਸੂਚਨਾ ਚੈਨਲਾਂ ਰਾਹੀਂ ਸੁਰੱਖਿਆ ਜਾਂਚ ਸੂਚਨਾਵਾਂ ਪ੍ਰਾਪਤ ਕਰਨ ਲਈ ਸਹਿਮਤ ਹਾਂ।'),
  (N'defaultConsentMessage', 10097, N'E ala i le kilikiina o le Auina atu, ou te malie e maua ni faasilasilaga o le Siaki o le Saogalemu e ala i auala faasilasilaga ua filifilia.'),
  (N'defaultConsentMessage', 10098, N'Кликом на Пошаљи, пристајем на примање обавештења о безбедносној провери путем одабраних канала обавештења.'),
  (N'defaultConsentMessage', 10099, N'Ka ho tobetsa Romella, ke lumela ho amohela tsebiso ea Safety Check ka liteishene tse khethiloeng tsa tsebiso.'),
  (N'defaultConsentMessage', 10100, N'By click Submit, I agree to receive Safety Check notifications through the selected notification channels.'),
  (N'defaultConsentMessage', 10101, N'Nekudzvanya Tumira, ini ndinobvuma kugamuchira Safety Check zviziviso kuburikidza neakasarudzwa chiziviso chiteshi.'),
  (N'defaultConsentMessage', 10102, N'جمع ڪرايو تي ڪلڪ ڪندي ، آئون چونڊيل نوٽيفڪيشن چينلز ذريعي حفاظت چيڪ نوٽيفڪيشن حاصل ڪرڻ تي رضامند آهيان.'),
  (N'defaultConsentMessage', 10103, N'ඉදිරිපත් කරන්න ක්ලික් කිරීමෙන්, තෝරාගත් දැනුම්දීම් නාලිකා හරහා ආරක්ෂිත චෙක්පත් දැනුම්දීම් ලබා ගැනීමට මම එකඟ වෙමි.'),
  (N'defaultConsentMessage', 10104, N'Anigoo gujinaya Gudbi, waxaan ogolaanayaa in la helo ogeysiisyada Safety Check iyada oo loo marayo kanaalada ogeysiisyada la doortay.'),
  (N'defaultConsentMessage', 10105, N'Җибәрергә басып, мин сайланган хәбәр каналлары аша Куркынычсызлыкны тикшерү турында белдерүләр алырга ризалык бирәм.'),
  (N'defaultConsentMessage', 10106, N'ཕུལ་བ་མནན་ན། ངས་བདམས་པའི་བརྡ་ཐོ་བརྒྱུད་ནས་བདེ་འཇགས་ཞིབ་བཤེར་གྱི་བརྡ་ཐོ་འབྱོར་བར་འཐད་པ་བྱུང་།'),
  (N'defaultConsentMessage', 10107, N'Submit ብምጥዋቕ በቲ እተመርጸ መትረብ መጠንቀቕታ ኣቢለ ናይ ድሕንነት መርመራ ምልክታታት ክቕበል እሰማማዕ እየ።'),
  (N'defaultConsentMessage', 10108, N'ʻI heʻeku lomiʻi ʻi he Fakahu, ʻoku ou loto fiemalie ke maʻu ʻa e ngaahi fakatokanga ʻo e Safety Check ʻo fakafou ʻi he ngaahi founga fanongonongo kuo fili.'),
  (N'defaultConsentMessage', 10109, N'«يوللاش» نى چېكىش ئارقىلىق، تاللانغان ئۇقتۇرۇش يوللىرى ئارقىلىق بىخەتەرلىك تەكشۈرۈش ئۇقتۇرۇشىنى تاپشۇرۇۋېلىشقا قوشۇلىمەن.'),
  (N'defaultConsentMessage', 10110, N'Ngokunqakraza Ngenisa, ndiyavuma ukufumana izaziso zoVavanyo loKhuseleko ngokusebenzisa amajelo ezaziso akhethiweyo.'),
  (N'defaultConsentMessage', 10111, N'Nipa titẹ Firanṣẹ, Mo gba lati gba awọn iwifunni Ayẹwo Aabo nipasẹ awọn ikanni iwifunni ti a yan.'),
  (N'defaultConsentMessage', 10112, N'Ngokuchofoza u-Thumela, ngivuma ukuthola izaziso zokuhlola ukuphepha ngeziteshi zezaziso ezikhethiwe.'),
  (N'defaultConsentMessage', 10113, N'بالنقر على إرسال، أوافق على تلقي إشعارات فحص السلامة من خلال قنوات الإشعار المختارة.'),
  (N'defaultConsentMessage', 10114, N'En fer clic a Enviar, consento a rebre notificacions de comprovació de seguretat a través dels canals de notificació seleccionats.'),
  (N'defaultConsentMessage', 10115, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10116, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10117, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10118, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10119, N'بە کرتە کردن لەسەر ناردن، ڕازی دەبم بە وەرگرتنی ئاگانامەکانی پشکنینی سەلامەتی لە رێگەی کەناڵە دیاریکراوەکانی ئاگادارکردنەوە.'),
  (N'defaultConsentMessage', 10120, N'Κάνοντας κλικ στην Υποβολή, συναινώ να λαμβάνω ειδοποιήσεις Safety Check μέσω των επιλεγμένων καναλιών ειδοποιήσεων.'),
  (N'defaultConsentMessage', 10121, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10122, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10123, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10124, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10125, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10126, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10127, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10128, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10129, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10130, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10131, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10132, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10133, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10134, N'I hereby consent to receive messages from Safety Check through SMS, WhatsApp, Voice Calls, and Email.'),
  (N'defaultConsentMessage', 10135, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10136, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10137, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10138, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10139, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10140, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10141, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10142, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10143, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10144, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10145, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10146, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10147, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10148, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10149, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10150, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10151, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10152, N'Al hacer clic en Enviar, consiento recibir notificaciones de comprobación de seguridad a través de los canales de notificación seleccionados.'),
  (N'defaultConsentMessage', 10153, N'En cliquant sur Envoyer, je consens à recevoir les notifications de contrôle de sécurité via les canaux de notification sélectionnés.'),
  (N'defaultConsentMessage', 10154, N'En cliquant sur Envoyer, je consens à recevoir les notifications de contrôle de sécurité via les canaux de notification sélectionnés.'),
  (N'defaultConsentMessage', 10155, N'En cliquant sur Envoyer, je consens à recevoir les notifications de contrôle de sécurité via les canaux de notification sélectionnés.'),
  (N'defaultConsentMessage', 10156, N'En cliquant sur Envoyer, je consens à recevoir les notifications de contrôle de sécurité via les canaux de notification sélectionnés.'),
  (N'defaultConsentMessage', 10158, N'En cliquant sur Envoyer, je consens à recevoir les notifications de contrôle de sécurité via les canaux de notification sélectionnés.'),
  (N'defaultConsentMessage', 10159, N'naqillugu naksiutilugu, angiqpunga piqattarumallunga attarnaqtailimanirmut qaujisarutinik qaujikkaijjutinik niruaqtausimajukkut qaujikkaijjutikkut.'),
  (N'defaultConsentMessage', 10160, N'Cliccando su Invia, acconsento a ricevere le notifiche di Safety Check tramite i canali di notifica selezionati.'),
  (N'defaultConsentMessage', 10161, N'Kwa kubofya Wasilisha, ninakubali kupokea arifa za Ukaguzi wa Usalama kupitia njia zilizochaguliwa za arifa.'),
  (N'defaultConsentMessage', 10162, N'بە کرتە کردن لەسەر ناردن، ڕازی دەبم بە وەرگرتنی ئاگانامەکانی پشکنینی سەلامەتی لە رێگەی کەناڵە دیاریکراوەکانی ئاگادارکردنەوە.'),
  (N'defaultConsentMessage', 10163, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10164, N'Илгээх товчийг дарснаар би сонгогдсон мэдэгдлийн сувгуудаар Safety Check мэдэгдэл хүлээн авахыг зөвшөөрч байна.'),
  (N'defaultConsentMessage', 10165, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10166, N'Door op Verzenden te klikken, geef ik toestemming om Safety Check-meldingen te ontvangen via de geselecteerde meldingskanalen.'),
  (N'defaultConsentMessage', 10167, N'Ved å klikke på Send samtykker jeg til å motta sikkerhetssjekkvarsler gjennom de valgte varslingskanalene.'),
  (N'defaultConsentMessage', 10169, N'Ka ho tobetsa Romella, ke lumela ho amohela tsebiso ea Safety Check ka liteishene tse khethiloeng tsa tsebiso.'),
  (N'defaultConsentMessage', 10170, N'Genom att klicka på Skicka samtycker jag till att få säkerhetskontrollaviseringar via de valda notifikationskanalerna.'),
  (N'defaultConsentMessage', 10171, N'Submit-e basyp, saýlanan bildiriş kanallary arkaly Safety Check bildirişlerini almaga razylaşýaryn.'),
  (N'defaultConsentMessage', 10172, N'Indem ich auf Absenden klicke, stimme ich zu, Sicherheitsüberprüfungsbenachrichtigungen über die ausgewählten Benachrichtigungskanäle zu erhalten.'),
  (N'defaultConsentMessage', 10173, N'Yuborish tugmasini bosib, tanlangan bildirishnoma kanallari orqali Xavfsizlik tekshiruvi bildirishnomalarini olishga rozilik beraman.'),
  (N'defaultConsentMessage', 10174, N'点击提交，即表示我同意通过所选通知渠道接收安全检查通知。'),
  (N'defaultConsentMessage', 10175, N'点击提交，即表示我同意通过所选通知渠道接收安全检查通知。'),
  (N'defaultConsentMessage', 10176, N'點擊「提交」即表示我同意透過所選通知管道接收安全檢查通知。'),
  (N'defaultConsentMessage', 10177, N'點擊「提交」即表示我同意透過所選通知管道接收安全檢查通知。'),
  (N'defaultConsentMessage', 10178, N'点击提交，即表示我同意通过所选通知渠道接收安全检查通知。');

MERGE SYS_ATTRIBUTE_DEF_TRANS AS T
USING (
  SELECT sa.ATTRIBUTE_ID, s.LanguageId AS LANGUAGE_ID, s.TranslatedAttribute
  FROM @SourceRows s
  INNER JOIN SYS_ATTRIBUTE_DEF sa ON sa.ATTRIBUTE = s.AttributeName
) AS S
ON T.ATTRIBUTE_ID = S.ATTRIBUTE_ID AND T.LANGUAGE_ID = S.LANGUAGE_ID
WHEN MATCHED THEN
  UPDATE SET ATTRIBUTE = S.TranslatedAttribute
WHEN NOT MATCHED BY TARGET THEN
  INSERT (ATTRIBUTE_ID, LANGUAGE_ID, ATTRIBUTE)
  VALUES (S.ATTRIBUTE_ID, S.LANGUAGE_ID, S.TranslatedAttribute);

COMMIT TRAN;
PRINT N'defaultConsentMessage seeded successfully.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  DECLARE @err NVARCHAR(4000) = ERROR_MESSAGE();
  RAISERROR(@err, 16, 1);
END CATCH;
