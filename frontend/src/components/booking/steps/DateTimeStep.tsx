diff --git a/frontend/src/app/artists/[id]/page.tsx b/frontend/src/app/artists/[id]/page.tsx
index 0b22270e0f68d00317aa8f9a05e9cf503bc9fa08..71c9e9d39a4f9e742d663b5eb43903e8c43f24de 100644

    b/frontend/src/app/artists/[id]/page.tsx
@@ -7,65 +7,69 @@ import MainLayout from '@/components/layout/MainLayout';
 import {
   ArtistProfile,
   Service,
   Review as ReviewType,
 } from '@/types';
 import {
   getArtist,
   getArtists,
   getArtistServices,
   getArtistReviews,
 } from '@/lib/api';
 
 import {
   StarIcon,
   MapPinIcon,
   BriefcaseIcon,
   EnvelopeIcon,
   UserIcon,
   PhoneIcon,
   GlobeAltIcon,
   CalendarDaysIcon,
 } from '@heroicons/react/24/outline';
 import Calendar from 'react-calendar';
 import 'react-calendar/dist/Calendar.css';
 import '@/styles/custom-calendar.css';
 import { format } from 'date-fns';
 import { enUS } from 'date-fns/locale';
 import { getFullImageUrl } from '@/lib/utils';
 
 export default function ArtistProfilePage() {
   const params = useParams();
   const router = useRouter();
   const artistId = Number(params.id);
 
   const [artist, setArtist] = useState<ArtistProfile | null>(null);
   const [services, setServices] = useState<Service[]>([]);
   const [reviews, setReviews] = useState<ReviewType[]>([]);
   const [otherArtists, setOtherArtists] = useState<ArtistProfile[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
 
   const [calendarDate, setCalendarDate] = useState<Date | null>(new Date());
   const formatLongDate = (_locale: string | undefined, date: Date) =>
     format(date, 'MMMM d, yyyy', { locale: enUS });
 
   useEffect(() => {
     if (!artistId) return;
 
     const fetchPageData = async () => {
       setLoading(true);
       try {
         const [artistRes, servicesRes, reviewsRes, allArtistsRes] = await Promise.all([
           getArtist(artistId),
           getArtistServices(artistId),
           getArtistReviews(artistId),
           getArtists(),
         ]);
         setArtist(artistRes.data);
         const processedServices = servicesRes.data.map((service: Service) => ({
           ...service,
           price:
             typeof service.price === 'string'
               ? parseFloat(service.price)
               : service.price,
           duration_minutes:
             typeof service.duration_minutes === 'string'
               ? parseInt(service.duration_minutes as unknown as string, 10)
               : service.duration_minutes,
         }));
diff --git a/frontend/src/app/artists/[id]/page.tsx b/frontend/src/app/artists/[id]/page.tsx
index 0b22270e0f68d00317aa8f9a05e9cf503bc9fa08..71c9e9d39a4f9e742d663b5eb43903e8c43f24de 100644

    b/frontend/src/app/artists/[id]/page.tsx
@@ -331,50 +335,52 @@ export default function ArtistProfilePage() {
 
             {/* ── Right-third: Contact & Booking Form ───────────────────────────────────── */}
             <aside id="booking-contact-sidebar" className="lg:col-span-1 mt-12 lg:mt-0">
               <div className="sticky top-24 space-y-6 p-6 bg-white rounded-lg shadow-lg border border-gray-200">
                 <h3 className="text-xl font-semibold text-gray-800 border-b pb-3">Contact & Booking</h3>
 
                 <p className="text-gray-600 text-sm flex items-center">
                   <EnvelopeIcon className="h-5 w-5 mr-2 text-gray-500" /> Email: {artist.user.email}
                 </p>
                 {artist.user.phone_number && (
                   <p className="text-gray-600 text-sm flex items-center">
                     <PhoneIcon className="h-5 w-5 mr-2 text-gray-500" /> Phone: {artist.user.phone_number}
                   </p>
                 )}
 
                 <div className="mt-6">
                   <h4 className="text-md font-medium text-gray-700 mb-3 flex items-center">
                     <CalendarDaysIcon className="h-5 w-5 mr-2 text-gray-500" /> Availability
                   </h4>
                   <Calendar
                     onChange={(value) => setCalendarDate(value as Date | null)}
                     value={calendarDate}
                     className="rounded-md border border-gray-300 shadow-sm w-full"
                     tileClassName="text-sm p-1 md:p-2"
                     view="month"
+                    locale="en-US"
+                    formatLongDate={formatLongDate}
                   />
                   <p className="mt-3 text-xs text-gray-500 text-center">
                     (Select a date/time then click Start Booking)
                   </p>
                 </div>
 
                 <div className="text-center">
                   <Link
                     href={`/booking?artist_id=${artist.user_id}`}
                     className="block w-full bg-rose-500 text-white py-3 px-4 rounded-lg hover:bg-rose-600 font-semibold text-lg transition-colors"
                   >
                     Start Booking
                   </Link>
                 </div>
               </div>
             </aside>
           </div>
 
           {/* ── “Explore Other Artists” Section ─────────────────────────────────────────── */}
           {otherArtists.length > 0 && (
             <section className="mt-16 pt-8 border-t border-gray-200">
               <h2 className="text-2xl font-bold text-gray-800 mb-8 text-center">
                 Explore Other Artists
               </h2>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
