import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Star, 
  MapPin, 
  Clock, 
  Calendar as CalendarIcon,
  CheckCircle2, 
  MessageCircle, 
  Share2,
  Heart,
  Info,
  ThumbsUp,
  Shield,
  CreditCard,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, debugTableSchema, resetSchemaCache } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { BookingForm } from '@/components/BookingForm';

interface ServiceDetails {
  id: string | number;
  name: string;
  price: number;
  description: string;
  duration?: string | number;
  provider: {
    id: string | number;
    business_name: string;
    rating: number | null;
    total_bookings: number | null;
    location: string;
    profile_picture?: string;
  };
}

const timeSlots = [
  { label: 'Morning (9 AM - 12 PM)', value: 'Morning (9 AM - 12 PM)' },
  { label: 'Afternoon (12 PM - 4 PM)', value: 'Afternoon (12 PM - 4 PM)' },
  { label: 'Evening (4 PM - 8 PM)', value: 'Evening (4 PM - 8 PM)' }
];

const ServiceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [service, setService] = useState<ServiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingDate, setBookingDate] = useState<Date | undefined>(undefined);
  const [timeSlot, setTimeSlot] = useState<string>('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Reset schema cache on component mount
      await resetSchemaCache();
      if (!id) {
        console.error('No service ID provided');
        toast({
          variant: "destructive",
          title: "Error",
          description: "No service ID provided"
        });
        navigate('/services');
        return;
      }
      console.log('Service ID from URL:', id);
      fetchServiceDetails();
    };
    init();
  }, [id]);

  // Add new effect to fetch booked slots when date changes
  // Set up real-time subscription when service is loaded
  useEffect(() => {
    if (service?.id && service?.provider?.id) {
      const subscription = supabase
        .channel('booking-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `provider_id=eq.${service.provider.id} AND service_id=eq.${service.id}`
          },
          (payload: { new: Record<string, any> | null; old: Record<string, any> | null }) => {
            // Refresh booked slots when any booking changes
            // but only if we're currently viewing the date that changed
            if (bookingDate) {
              const formattedCurrentDate = format(bookingDate, 'yyyy-MM-dd');
              const changedDate = payload.new?.booking_date || payload.old?.booking_date;
              if (formattedCurrentDate === changedDate) {
                console.log('Booking changed for current date, refreshing slots...');
                fetchBookedSlots();
              }
            }
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [service?.id, service?.provider?.id]);

  // Fetch booked slots whenever date changes
  useEffect(() => {
    if (bookingDate && service?.id && service?.provider?.id) {
      fetchBookedSlots();
    }
  }, [bookingDate]);

  const fetchServiceDetails = async () => {
    try {
      console.log('Fetching service with ID:', id);
      
      const { data, error } = await supabase
        .from('provider_services')
        .select(`
          *,
          provider:providers (
            id,
            business_name,
            location,
            status,
            rating,
            total_bookings,
            profile_picture
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching service:', error);
        throw error;
      }

      if (!data) {
        console.error('No data returned');
        throw new Error('No data returned from database');
      }

      console.log('Raw service data:', data);
      
      // Transform the data to match our interface
      const transformedData = {
        id: data.id,
        name: data.name,
        price: data.price,
        description: data.description,
        duration: data.duration,
        provider: {
          id: data.provider?.id,
          business_name: data.provider?.business_name || 'Unknown Provider',
          rating: data.provider?.rating,
          total_bookings: data.provider?.total_bookings,
          location: data.provider?.location || 'Location not specified',
          profile_picture: data.provider?.profile_picture
        }
      };
      
      console.log('Transformed data:', transformedData);
      setService(transformedData);
    } catch (error: any) {
      console.error('Service detail error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to load service details"
      });
      navigate('/services');
    } finally {
      setLoading(false);
    }
  };

  const fetchBookedSlots = async () => {
    if (!service?.id || !service?.provider?.id || !bookingDate) return;

    setSlotsLoading(true);
    try {
      const formattedDate = format(bookingDate, 'yyyy-MM-dd');
      
      // Get all active bookings for the selected date (pending, confirmed, or completed)
      const { data, error } = await supabase
        .from('bookings')
        .select('preferred_time, status')
        .eq('provider_id', service.provider.id)
        .eq('service_id', service.id)
        .eq('booking_date', formattedDate)
        .neq('status', 'cancelled');

      if (error) {
        console.error('Error fetching booked slots:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch available slots. Please try again."
        });
        return;
      }

      // Filter out any null values and get unique time slots
      const bookedTimes = [...new Set(data?.map(booking => booking.preferred_time).filter(Boolean) || [])];
      console.log('Updated booked slots:', bookedTimes);
      setBookedSlots(bookedTimes);
      setSlotsLoading(false);
    } catch (error) {
      console.error('Error fetching booked slots:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch available slots. Please try again."
      });
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleBooking = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "Please login to request this service"
      });
      navigate('/auth');
      return;
    }

    // Clear the selected time slot immediately to prevent double booking
    const selectedTimeSlot = timeSlot;
    setTimeSlot('');

    if (!bookingDate || !timeSlot) {
      toast({
        variant: "destructive",
        title: "Incomplete Details",
        description: "Please select both date and time slot"
      });
      return;
    }
    
    setBookingLoading(true);
    try {
      // First, let's check if the service and provider exist
      if (!service?.id || !service?.provider?.id) {
        throw new Error('Service or provider information is missing');
      }

      const formattedDate = format(bookingDate, 'yyyy-MM-dd');
      
      // Check for any existing active bookings for this slot
      const { data: existingBooking, error: checkError } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('provider_id', service.provider.id)
        .eq('service_id', service.id)
        .eq('booking_date', formattedDate)
        .eq('preferred_time', timeSlot)
        .neq('status', 'cancelled')
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingBooking?.id) {
        setTimeSlot(selectedTimeSlot); // Restore the time slot selection if booking fails
        const status = existingBooking.status === 'completed' ? 'completed' : 'booked';
        throw new Error(`This time slot is already ${status}. Please select a different time.`);
      }
      
      // Create new booking
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          provider_id: service.provider.id,
          service_id: service.id,
          booking_date: formattedDate,
          preferred_time: timeSlot,
          status: 'pending',
          total_amount: service.price
        });

      if (error) {
        console.error('Service request error:', error);
        throw error;
      }

      toast({
        title: "Request Sent",
        description: "Your service request has been sent to the provider"
      });
      
      navigate('/bookings');
    } catch (error: any) {
      console.error('Service request error details:', error);
      toast({
        variant: "destructive",
        title: "Request Failed",
        description: error.message || "Failed to send service request"
      });
      // Restore the time slot selection if booking fails
      setTimeSlot(selectedTimeSlot);
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!service) {
  return (
      <div className="container py-10 text-center">
        <h1 className="text-2xl font-bold">Service not found</h1>
        <Button onClick={() => navigate('/services')} className="mt-4">
              Back to Services
        </Button>
          </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Service Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-start gap-4">
            <img
              src={service.provider.profile_picture || '/default-profile.png'}
              alt={service.provider.business_name}
              className="w-16 h-16 rounded-full object-cover"
            />
            <div>
              <h1 className="text-2xl font-bold">{service.name}</h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Star className="h-4 w-4 fill-yellow-400 stroke-yellow-400" />
                <span>{service.provider.rating?.toFixed(1) || 'New'}</span>
                <span>•</span>
                <span>{service.provider.total_bookings || 0} bookings</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground mt-1">
                <MapPin className="h-4 w-4" />
                <span>{service.provider.location}</span>
                </div>
            </div>
            </div>
            
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">About This Service</h2>
            <p className="text-muted-foreground">{service.description}</p>
                    </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Duration</p>
                  <p className="text-sm text-muted-foreground">{service.duration || '1-2 hours'}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Guaranteed</p>
                  <p className="text-sm text-muted-foreground">Quality Service</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Secure</p>
                  <p className="text-sm text-muted-foreground">Safe Payment</p>
                </div>
              </CardContent>
            </Card>
                      </div>
                    </div>
                    
        {/* Booking Card */}
        <div>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-2xl font-bold">₹{service.price}</h3>
                <p className="text-sm text-muted-foreground">Base price</p>
                </div>
                
                    <div className="space-y-4">
                <div className="space-y-2">
                  <label className="font-medium">Select Date</label>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant={"outline"}
                                            className={cn(
                                              "w-full justify-start text-left font-normal",
                          !bookingDate && "text-muted-foreground"
                                            )}
                                          >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                        {bookingDate ? format(bookingDate, "PPP") : <span>Pick a date</span>}
                                          </Button>
                                        </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                                            mode="single"
                        selected={bookingDate}
                        onSelect={setBookingDate}
                                            initialFocus
                        disabled={(date) => 
                          date < new Date() || 
                          date > new Date(new Date().setMonth(new Date().getMonth() + 3))
                        }
                                          />
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                    
                <div className="space-y-2">
                  <label className="font-medium flex items-center justify-between">
                    <span>Select Time</span>
                    {bookingDate && (
                      <span className="text-xs text-muted-foreground">
                        {slotsLoading ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Checking availability...
                          </span>
                        ) : (
                          `${bookedSlots.length} of ${timeSlots.length} slots booked`
                        )}
                      </span>
                    )}
                  </label>
                  <Select value={timeSlot} onValueChange={setTimeSlot} disabled={slotsLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder={slotsLoading ? "Loading slots..." : "Choose a time slot"} />
                      {slotsLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                                        </SelectTrigger>
                                        <SelectContent>
                      {timeSlots.map((slot) => {
                        const isBooked = bookedSlots.includes(slot.value);
                        return (
                          <SelectItem 
                            key={slot.value} 
                            value={slot.value}
                            className={cn(
                              "flex items-center justify-between gap-2",
                              isBooked && "opacity-50 cursor-not-allowed text-muted-foreground"
                            )}
                            disabled={isBooked}
                          >
                            <span>{slot.label}</span>
                            {isBooked ? (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                Unavailable
                              </span>
                            ) : (
                              <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                Available
                              </span>
                            )}
                              </SelectItem>
                        );
                      })}
                          </SelectContent>
                        </Select>
                      </div>
                      
                            <Button
                  className="w-full" 
                      onClick={handleBooking}
                  disabled={bookingLoading || !bookingDate || !timeSlot}
                >
                  {bookingLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Request...
                    </>
                  ) : (
                    'Request Service'
                  )}
                    </Button>
                    
                <p className="text-xs text-center text-muted-foreground">
                  The provider will respond to your request soon
                </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
  );
};

export default ServiceDetail;
