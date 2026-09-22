import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  Clock3,
  FileText,
  Home,
  MessageCircle,
  Plane,
  Plus,
  Settings,
  Users,
  Workflow
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Bookings", href: "/bookings", icon: Plane },
  { label: "Add Booking", href: "/bookings/add", icon: Plus },
  { label: "Upcoming Journeys", href: "/upcoming-journeys", icon: CalendarCheck },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "WhatsApp Messages", href: "/whatsapp-messages", icon: MessageCircle },
  { label: "Automation", href: "/automation", icon: Settings },
  { label: "Message Templates", href: "/message-templates", icon: FileText },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Workflow }
];

export const bookings = [
  { customer: "Rahul Sharma", phone: "+91 98765 43210", initials: "RS", pnr: "ABC123", flight: "AI-202", airline: "Air India", route: "BOM → DEL", routeLabel: "Mumbai to Delhi", departure: "10:30 AM", date: "28 Sep 2026", status: "Confirmed", whatsapp: "Sent" },
  { customer: "Priya Mehta", phone: "+91 99887 76655", initials: "PM", pnr: "XYZ789", flight: "6E-531", airline: "IndiGo", route: "BOM → BLR", routeLabel: "Mumbai to Bangalore", departure: "12:45 PM", date: "28 Sep 2026", status: "Confirmed", whatsapp: "Sent" },
  { customer: "Amit Patel", phone: "+91 91234 56789", initials: "AP", pnr: "LMN456", flight: "EK-501", airline: "Emirates", route: "BOM → DXB", routeLabel: "Mumbai to Dubai", departure: "02:15 PM", date: "29 Sep 2026", status: "Pending", whatsapp: "Scheduled" },
  { customer: "Sneha Iyer", phone: "+91 88776 65544", initials: "SI", pnr: "QWE321", flight: "AI-303", airline: "Air India", route: "DEL → COK", routeLabel: "Delhi to Kochi", departure: "06:20 PM", date: "29 Sep 2026", status: "Confirmed", whatsapp: "Sent" },
  { customer: "Karan Malhotra", phone: "+91 97654 32109", initials: "KM", pnr: "RTY654", flight: "6E-210", airline: "IndiGo", route: "BOM → HYD", routeLabel: "Mumbai to Hyderabad", departure: "09:10 PM", date: "30 Sep 2026", status: "Confirmed", whatsapp: "Sent" },
  { customer: "Neha Panjwani", phone: "+91 98675 43211", initials: "NP", pnr: "UIO987", flight: "SG-816", airline: "SpiceJet", route: "BOM → GOI", routeLabel: "Mumbai to Goa", departure: "07:00 AM", date: "01 Oct 2026", status: "Failed", whatsapp: "Failed" },
  { customer: "Vikram Rao", phone: "+91 90987 65432", initials: "VR", pnr: "JKL654", flight: "AI-887", airline: "Air India", route: "BLR → BOM", routeLabel: "Bangalore to Mumbai", departure: "11:25 AM", date: "01 Oct 2026", status: "Confirmed", whatsapp: "Sent" },
  { customer: "Ananya Tiwari", phone: "+91 99876 12345", initials: "AT", pnr: "MNB321", flight: "6E-729", airline: "IndiGo", route: "DEL → AMD", routeLabel: "Delhi to Ahmedabad", departure: "04:40 PM", date: "02 Oct 2026", status: "Pending", whatsapp: "Scheduled" }
];

export const reminders = [
  { time: "Today\n6:30 PM", name: "Priya Mehta", meta: "PNR: XYZ789 | 24h reminder" },
  { time: "Tomorrow\n10:00 AM", name: "Amit Patel", meta: "PNR: LMN456 | 48h reminder" },
  { time: "27 Sep\n10:00 AM", name: "Rohit Verma", meta: "PNR: DEF987 | 24h reminder" },
  { time: "27 Sep\n6:00 PM", name: "Neha Soni", meta: "PNR: GHI321 | 48h reminder" },
  { time: "28 Sep\n8:00 AM", name: "Vikram Rao", meta: "PNR: JKL654 | Final reminder" }
];

export const activities = [
  { type: "success", title: "Booking created - Rahul Sharma", meta: "PNR: ABC123", time: "5 mins ago" },
  { type: "message", title: "Confirmation sent", meta: "To: +91 98765 43210", time: "6 mins ago" },
  { type: "bell", title: "48h reminder scheduled", meta: "PNR: XYZ789", time: "12 mins ago" },
  { type: "danger", title: "Message failed", meta: "To: +91 91234 56789", time: "18 mins ago" },
  { type: "user", title: "New customer added - Priya Mehta", meta: "+91 99887 76655", time: "25 mins ago" }
];

export const bookingBars = [72, 65, 89, 76, 94, 81, 124];
export const bookingLabels = ["18 Sep", "19 Sep", "20 Sep", "21 Sep", "22 Sep", "23 Sep", "24 Sep"];

export const statCards = [
  { title: "Total Bookings", value: "124", icon: Plane, tone: "blue", delta: "↑ 12%", sub: "vs last week" },
  { title: "Today's Journeys", value: "28", icon: CalendarCheck, tone: "green", delta: "↑ 8%", sub: "vs yesterday" },
  { title: "Upcoming Journeys", value: "96", icon: Clock3, tone: "purple", delta: "↑ 18%", sub: "vs last week" },
  { title: "Messages Sent", value: "412", icon: MessageCircle, tone: "emerald", delta: "↑ 22%", sub: "vs last week" },
  { title: "Pending Messages", value: "14", icon: Clock3, tone: "orange", delta: "↓ 6%", sub: "vs yesterday", negative: true },
  { title: "Failed Messages", value: "3", icon: AlertTriangle, tone: "rose", delta: "↓ 40%", sub: "vs yesterday" }
];

export const bookingStats = [
  { title: "Total Bookings", value: "124", icon: Plane, tone: "blue", delta: "↑ 12%", sub: "vs last month" },
  { title: "Today's Journeys", value: "28", icon: CalendarCheck, tone: "green", delta: "↑ 8%", sub: "vs yesterday" },
  { title: "Upcoming Journeys", value: "96", icon: Clock3, tone: "purple", delta: "↑ 18%", sub: "vs last week" },
  { title: "Pending Confirmations", value: "14", icon: Clock3, tone: "orange", delta: "↓ 6%", sub: "vs yesterday", negative: true },
  { title: "Failed Bookings", value: "3", icon: AlertTriangle, tone: "rose", delta: "↓ 40%", sub: "vs last week" }
];

export const upcomingStats = [
  { title: "Today's Journeys", value: "28", icon: Plane, tone: "blue", delta: "↑ 8%", sub: "vs yesterday" },
  { title: "This Week", value: "96", icon: CalendarCheck, tone: "green", delta: "↑ 12%", sub: "vs last week" },
  { title: "This Month", value: "256", icon: CalendarCheck, tone: "purple", delta: "↑ 18%", sub: "vs last month" },
  { title: "Total Upcoming", value: "1,482", icon: Users, tone: "orange", delta: "↑ 22%", sub: "vs last month" }
];

export const upcomingJourneys = [
  { time: "10:30 AM", flight: "AI-202", airline: "Air India", logo: "AI", route: "BOM → DEL", routeLabel: "Mumbai to Delhi", pnr: "ABC123", customer: "Rahul Sharma", phone: "+91 98765 43210" },
  { time: "12:45 PM", flight: "6E-531", airline: "IndiGo", logo: "6E", route: "BOM → BLR", routeLabel: "Mumbai to Bangalore", pnr: "XYZ789", customer: "Priya Mehta", phone: "+91 99887 76655" },
  { time: "02:15 PM", flight: "EK-501", airline: "Emirates", logo: "EK", route: "BOM → DXB", routeLabel: "Mumbai to Dubai", pnr: "LMN456", customer: "Amit Patel", phone: "+91 91234 56789" },
  { time: "04:40 PM", flight: "UK-955", airline: "Vistara", logo: "UK", route: "DEL → BOM", routeLabel: "Delhi to Mumbai", pnr: "QWE321", customer: "Sneha Iyer", phone: "+91 88776 65544" },
  { time: "06:20 PM", flight: "SG-816", airline: "SpiceJet", logo: "SG", route: "BOM → GOI", routeLabel: "Mumbai to Goa", pnr: "RTY654", customer: "Karan Malhotra", phone: "+91 97654 32109" },
  { time: "08:10 PM", flight: "AI-887", airline: "Air India", logo: "AI", route: "BLR → SIN", routeLabel: "Bangalore to Singapore", pnr: "UIO987", customer: "Neha Panjwani", phone: "+91 98675 43211" },
  { time: "09:30 PM", flight: "6E-729", airline: "IndiGo", logo: "6E", route: "BOM → HYD", routeLabel: "Mumbai to Hyderabad", pnr: "MNB321", customer: "Vikram Rao", phone: "+91 90987 65432" },
  { time: "11:25 PM", flight: "AI-303", airline: "Air India", logo: "AI", route: "COK → BOM", routeLabel: "Kochi to Mumbai", pnr: "DEF987", customer: "Ananya Tiwari", phone: "+91 99876 12345" }
];

export const whatsappStats = [
  { title: "Total Messages", value: "412", icon: MessageCircle, tone: "green", delta: "↑ 22%", sub: "vs last week" },
  { title: "Delivered", value: "332", icon: MessageCircle, tone: "emerald", delta: "80%", sub: "delivery rate" },
  { title: "Read", value: "286", icon: CalendarCheck, tone: "blue", delta: "69%", sub: "read rate" },
  { title: "Pending", value: "56", icon: Clock3, tone: "orange", delta: "14%", sub: "pending" },
  { title: "Failed", value: "3", icon: AlertTriangle, tone: "rose", delta: "1%", sub: "failed rate", negative: true }
];

export const whatsappMessages = [
  { customer: "Rahul Sharma", phone: "+91 98765 43210", initials: "RS", type: "Booking Confirmation", pnr: "ABC123", flight: "AI-202", sent: "28 Sep 2026\n10:32 AM", status: "Delivered" },
  { customer: "Priya Mehta", phone: "+91 99887 76655", initials: "PM", type: "48h Reminder", pnr: "XYZ789", flight: "6E-531", sent: "26 Sep 2026\n10:30 AM", status: "Read" },
  { customer: "Amit Patel", phone: "+91 91234 56789", initials: "AP", type: "24h Reminder", pnr: "LMN456", flight: "EK-501", sent: "27 Sep 2026\n11:15 AM", status: "Delivered" },
  { customer: "Sneha Iyer", phone: "+91 88776 65544", initials: "SI", type: "Final Reminder", pnr: "QWE321", flight: "AI-303", sent: "28 Sep 2026\n06:00 AM", status: "Read" },
  { customer: "Karan Malhotra", phone: "+91 97654 32109", initials: "KM", type: "Booking Confirmation", pnr: "RTY654", flight: "6E-210", sent: "25 Sep 2026\n04:22 PM", status: "Failed" },
  { customer: "Neha Panjwani", phone: "+91 98675 43211", initials: "NP", type: "24h Reminder", pnr: "UIO987", flight: "SG-816", sent: "27 Sep 2026\n10:00 AM", status: "Delivered" },
  { customer: "Vikram Rao", phone: "+91 90987 65432", initials: "VR", type: "48h Reminder", pnr: "JKL654", flight: "AI-887", sent: "26 Sep 2026\n09:10 AM", status: "Read" },
  { customer: "Ananya Tiwari", phone: "+91 99876 12345", initials: "AT", type: "Final Reminder", pnr: "MNB321", flight: "6E-729", sent: "28 Sep 2026\n07:30 AM", status: "Pending" }
];

export const automationStats = [
  { title: "Active Rules", value: "4", icon: Settings, tone: "green", delta: "Automated messaging enabled", sub: "" },
  { title: "Messages Sent", value: "1,428", icon: Clock3, tone: "blue", delta: "This month", sub: "" },
  { title: "Success Rate", value: "98%", icon: Users, tone: "purple", delta: "Messages delivered", sub: "" },
  { title: "Inactive Rules", value: "2", icon: Clock3, tone: "orange", delta: "Not sending messages", sub: "" }
];

export const automationRules = [
  { title: "Booking Confirmation", active: true, tone: "green", body: "Send confirmation message immediately after creating a booking.", chips: ["Instant", "Template: booking_confirmation"], preview: "Hi {{customer_name}} 👋\nYour flight booking has been confirmed!\n\nPNR: {{pnr}}\nFlight: {{flight_number}}\nDate: {{date}} | {{time}}\n..." },
  { title: "48 Hours Before Journey", active: true, tone: "blue", body: "Send a reminder 48 hours before departure.", chips: ["48 hours before", "Template: reminder_48h"], preview: "Hi {{customer_name}},\nYour flight to {{to}} is in 48 hours.\n\nFlight: {{flight_number}}\nDate: {{date}} | {{time}}\nTerminal: {{terminal}}\n..." },
  { title: "24 Hours Before Journey", active: true, tone: "purple", body: "Send a reminder 24 hours before departure.", chips: ["24 hours before", "Template: reminder_24h"], preview: "Hi {{customer_name}},\nYour flight is tomorrow! 🛫\n\nFlight: {{flight_number}}\nDate: {{date}} | {{time}}\nDon't forget to check-in.\n..." },
  { title: "On the Day of Journey", active: true, tone: "orange", body: "Send a final reminder on the day of travel.", chips: ["On journey date", "Template: reminder_day"], preview: "Hi {{customer_name}},\nWishing you a safe journey! ✨\n\nFlight: {{flight_number}}\nDate: {{date}} | {{time}}\nFrom: {{from}} → To: {{to}}" },
  { title: "Booking Cancellation", active: false, tone: "rose", body: "Send cancellation confirmation message.", chips: ["Instant", "Template: cancellation"], preview: "Hi {{customer_name}},\nYour booking (PNR: {{pnr}}) has been cancelled.\n\nIf you have any questions, please contact us.\n..." }
];

export const templateStats = [
  { title: "Active Templates", value: "6", icon: MessageCircle, tone: "green", delta: "", sub: "" },
  { title: "Draft Templates", value: "2", icon: FileText, tone: "purple", delta: "", sub: "" },
  { title: "Messages Sent", value: "12,486", icon: Clock3, tone: "orange", delta: "", sub: "" },
  { title: "Delivery Rate", value: "98%", icon: BarChart3, tone: "blue", delta: "", sub: "" }
];

export const templates = [
  { name: "Booking Confirmation", desc: "Sent immediately after booking is created.", category: "Booking", status: "Active", date: "20 Sep 2026", sent: "4,281", tone: "blue" },
  { name: "48 Hours Reminder", desc: "Reminder 2 days before departure.", category: "Reminder", status: "Active", date: "18 Sep 2026", sent: "3,142", tone: "purple" },
  { name: "24 Hours Reminder", desc: "Reminder 1 day before departure.", category: "Reminder", status: "Active", date: "18 Sep 2026", sent: "2,986", tone: "purple" },
  { name: "Final Reminder", desc: "Sent on the day of journey.", category: "Reminder", status: "Active", date: "17 Sep 2026", sent: "2,654", tone: "orange" },
  { name: "Booking Cancellation", desc: "Sent when a booking is cancelled.", category: "Booking", status: "Active", date: "15 Sep 2026", sent: "985", tone: "rose" },
  { name: "Feedback Request", desc: "Ask for feedback after journey.", category: "Feedback", status: "Active", date: "12 Sep 2026", sent: "742", tone: "green" },
  { name: "Special Offers", desc: "Send offers and deals to customers.", category: "Marketing", status: "Draft", date: "10 Sep 2026", sent: "0", tone: "purple" },
  { name: "General Update", desc: "For any important announcements.", category: "General", status: "Draft", date: "10 Sep 2026", sent: "0", tone: "gray" }
];

export const customerStats = [
  { title: "Total Customers", value: "1,482", icon: Users, tone: "blue", delta: "↑ 18%", sub: "vs last month" },
  { title: "Repeat Customers", value: "892", icon: Settings, tone: "green", delta: "↑ 24%", sub: "vs last month" },
  { title: "New Customers", value: "590", icon: Users, tone: "purple", delta: "↑ 12%", sub: "vs last month" },
  { title: "Customer Rating", value: "4.8/5", icon: AlertTriangle, tone: "orange", delta: "Based on 320 reviews", sub: "" }
];

export const customers = [
  { name: "Rahul Sharma", segment: "Frequent Traveler", initials: "RS", phone: "+91 98765 43210", email: "rahul@gmail.com", bookings: 8, spent: "₹1,24,560", last: "28 Sep 2026\nBOM → DEL", status: "Active" },
  { name: "Priya Mehta", segment: "Loyal Customer", initials: "PM", phone: "+91 99887 76655", email: "priya@mehta.com", bookings: 5, spent: "₹78,320", last: "26 Sep 2026\nBOM → BLR", status: "Active" },
  { name: "Amit Patel", segment: "Corporate", initials: "AP", phone: "+91 91234 56789", email: "amit@patel.com", bookings: 12, spent: "₹2,45,780", last: "27 Sep 2026\nBOM → DXB", status: "VIP" },
  { name: "Sneha Iyer", segment: "Family Traveler", initials: "SI", phone: "+91 88776 65544", email: "sneha.iyer@gmail.com", bookings: 4, spent: "₹62,450", last: "15 Sep 2026\nDEL → BOM", status: "Active" },
  { name: "Karan Malhotra", segment: "Business", initials: "KM", phone: "+91 97654 32109", email: "karan@malhotra.com", bookings: 6, spent: "₹1,08,900", last: "20 Sep 2026\nBOM → GOI", status: "Active" },
  { name: "Neha Panjwani", segment: "Leisure Traveler", initials: "NP", phone: "+91 98675 43211", email: "neha.p@gmail.com", bookings: 3, spent: "₹48,230", last: "12 Sep 2026\nBLR → SIN", status: "Active", photo: true },
  { name: "Vikram Rao", segment: "Group Traveler", initials: "VR", phone: "+91 90987 65432", email: "vikram.rao@gmail.com", bookings: 7, spent: "₹1,56,780", last: "18 Sep 2026\nBOM → HYD", status: "Inactive" },
  { name: "Ananya Tiwari", segment: "Student Traveler", initials: "AT", phone: "+91 99876 12345", email: "ananya.t@gmail.com", bookings: 2, spent: "₹28,560", last: "10 Sep 2026\nCOK → BOM", status: "Active", photo: true }
];

export const customerBookings = [
  { date: "28 Sep 2026\nMon, 10:30 AM", pnr: "ABC123", route: "BOM → DEL\nMumbai to Delhi", airline: "Air India\nAI-202", amount: "₹12,450", status: "Confirmed", logo: "AI" },
  { date: "15 Aug 2026\nThu, 06:20 PM", pnr: "XYZ789", route: "BOM → BLR\nMumbai to Bangalore", airline: "IndiGo\n6E-531", amount: "₹14,230", status: "Completed", logo: "6E" },
  { date: "12 Jul 2026\nSat, 11:15 AM", pnr: "LMN456", route: "BOM → DXB\nMumbai to Dubai", airline: "Emirates\nEK-501", amount: "₹48,780", status: "Completed", logo: "EK" },
  { date: "20 May 2026\nWed, 09:40 PM", pnr: "QWE321", route: "DEL → BOM\nDelhi to Mumbai", airline: "Vistara\nUK-955", amount: "₹11,560", status: "Completed", logo: "UK" },
  { date: "18 Mar 2026\nWed, 07:30 AM", pnr: "RTY654", route: "BOM → GOI\nMumbai to Goa", airline: "SpiceJet\nSG-816", amount: "₹8,420", status: "Completed", logo: "SG" }
];

export const reportStats = [
  { title: "Total Bookings", value: "412", icon: Plane, tone: "blue", delta: "↑ 22%", sub: "vs last month" },
  { title: "Total Revenue", value: "₹12,48,560", icon: Settings, tone: "green", delta: "↑ 18%", sub: "vs last month" },
  { title: "Total Customers", value: "1,482", icon: Users, tone: "purple", delta: "↑ 24%", sub: "vs last month" },
  { title: "Messages Sent", value: "3,894", icon: MessageCircle, tone: "emerald", delta: "↑ 36%", sub: "vs last month" }
];

export const recentReportBookings = [
  ["28 Sep 2026", "ABC123", "Rahul Sharma", "BOM → DEL", "₹12,450", "Confirmed", "Website"],
  ["27 Sep 2026", "XYZ789", "Priya Mehta", "BOM → BLR", "₹8,230", "Completed", "WhatsApp"],
  ["26 Sep 2026", "LMN456", "Amit Patel", "DEL → BOM", "₹15,780", "Confirmed", "Phone"],
  ["25 Sep 2026", "QWE321", "Sneha Iyer", "BOM → GOI", "₹9,560", "Completed", "Website"],
  ["24 Sep 2026", "RTY654", "Karan Malhotra", "BOM → DXB", "₹48,230", "Confirmed", "WhatsApp"]
];
