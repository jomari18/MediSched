begin;
insert into public.doctors(id,name) values
 ('dr-smith','Dr. Smith'), ('dr-johnson','Dr. Johnson'), ('dr-williams','Dr. Williams'),
 ('dr-brown','Dr. Brown'), ('dr-liza-torres','Dr. Liza Torres'), ('dr-miguel','Dr. Miguel'),
 ('dr-karen','Dr. Karen'), ('dr-mark','Dr. Mark'), ('dr-garcia','Dr. Garcia');
insert into public.appointment_types(id,name) values
 ('general-check-up','General Check-up'), ('dental-cleaning','Dental Cleaning'),
 ('follow-up-consultation','Follow-up Consultation'), ('vaccination','Vaccination'),
 ('therapy-session','Therapy Session'), ('dermatology','Dermatology'),
 ('telemedicine-appointment','Telemedicine Appointment'), ('prenatal-check-up','Prenatal Check-up'),
 ('cardiology-consultation','Cardiology Consultation'), ('laboratory-test','Laboratory Test');
-- Fresh demo catalogs do not approve any production legacy migration.
commit;
