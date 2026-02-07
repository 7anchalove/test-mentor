import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEACHERS = [
  { email: "prof.rossi@testmentor.com", password: "Teacher123!", name: "Prof. Marco Rossi", bio: "10+ years teaching Italian language exams", headline: "ITA L2 & CLA Expert", subjects: ["ITA L2", "CLA", "Grammar"] },
  { email: "dr.bianchi@testmentor.com", password: "Teacher123!", name: "Dr. Elena Bianchi", bio: "University admission test specialist", headline: "TOLC Preparation Specialist", subjects: ["TOLC-I", "TOLC-E", "Mathematics"] },
  { email: "prof.ferrari@testmentor.com", password: "Teacher123!", name: "Prof. Luca Ferrari", bio: "Engineering and science test prep", headline: "STEM Test Coach", subjects: ["TOLC-I", "TOLC-S", "Physics"] },
  { email: "dr.romano@testmentor.com", password: "Teacher123!", name: "Dr. Sofia Romano", bio: "Language certification expert with CILS/CELI experience", headline: "Language Certification Guru", subjects: ["ITA L2", "CENTS", "CLA"] },
  { email: "prof.conti@testmentor.com", password: "Teacher123!", name: "Prof. Alessandro Conti", bio: "Former TOLC exam committee member", headline: "TOLC Insider", subjects: ["TOLC-E", "TOLC-F", "TOLC-SU", "Economics"] },
  { email: "dr.moretti@testmentor.com", password: "Teacher123!", name: "Dr. Giulia Moretti", bio: "Biology and medical science test prep specialist", headline: "Bio & Med Test Expert", subjects: ["TOLC-B", "TOLC-S", "Biology"] },
];

const AVAILABILITY = [
  // Each teacher gets Mon-Fri 9:00-17:00
  { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
  { dayOfWeek: 1, startTime: "14:00", endTime: "17:00" },
  { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
  { dayOfWeek: 2, startTime: "14:00", endTime: "17:00" },
  { dayOfWeek: 3, startTime: "09:00", endTime: "13:00" },
  { dayOfWeek: 3, startTime: "14:00", endTime: "17:00" },
  { dayOfWeek: 4, startTime: "09:00", endTime: "13:00" },
  { dayOfWeek: 4, startTime: "14:00", endTime: "17:00" },
  { dayOfWeek: 5, startTime: "09:00", endTime: "13:00" },
  { dayOfWeek: 5, startTime: "14:00", endTime: "17:00" },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const results = [];

    for (const teacher of TEACHERS) {
      // Check if user already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', teacher.email)
        .single();

      if (existingProfile) {
        results.push({ email: teacher.email, status: 'already exists' });
        continue;
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: teacher.email,
        password: teacher.password,
        email_confirm: true,
        user_metadata: { name: teacher.name, role: 'teacher' },
      });

      if (authError) {
        console.error(`Failed to create ${teacher.email}:`, authError.message);
        results.push({ email: teacher.email, status: 'error', error: authError.message });
        continue;
      }

      const userId = authData.user.id;

      // Update profile with bio
      await supabase
        .from('profiles')
        .update({ bio: teacher.bio })
        .eq('user_id', userId);

      // Update teacher profile
      await supabase
        .from('teacher_profiles')
        .update({ headline: teacher.headline, subjects: teacher.subjects })
        .eq('user_id', userId);

      // Add availability rules
      for (const rule of AVAILABILITY) {
        await supabase.from('teacher_availability_rules').insert({
          teacher_id: userId,
          day_of_week: rule.dayOfWeek,
          start_time: rule.startTime,
          end_time: rule.endTime,
          enabled: true,
        });
      }

      // Add some unavailable exceptions for variety (next Saturday)
      const nextSat = new Date();
      nextSat.setDate(nextSat.getDate() + ((6 - nextSat.getDay() + 7) % 7 || 7));
      
      if (TEACHERS.indexOf(teacher) % 2 === 0) {
        await supabase.from('teacher_unavailable_dates').insert({
          teacher_id: userId,
          start_date_time: new Date(nextSat.setHours(9, 0, 0, 0)).toISOString(),
          end_date_time: new Date(nextSat.setHours(17, 0, 0, 0)).toISOString(),
          reason: 'Personal day',
        });
      }

      results.push({ email: teacher.email, status: 'created', userId });
      console.log(`Created teacher: ${teacher.name}`);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
