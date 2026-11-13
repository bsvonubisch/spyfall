export const DEFAULT_LOCATIONS = ['Airport', 'Beach', 'Casino', 'Circus', 'Cruise ship', 'Hospital', 'Hotel', 'Movie studio', 'Museum', 'Police station', 'Restaurant', 'School', 'Space station', 'Submarine', 'Supermarket', 'Theater', 'Train', 'University', 'Zoo'];
export const LOCATION_SETS = [
  { id: 'classic', name: 'Classic · default', locations: DEFAULT_LOCATIONS },
  { id: 'everyday', name: 'Everyday places', locations: ['Bakery', 'Barber shop', 'Bookshop', 'Bus stop', 'Café', 'Dentist', 'Gym', 'Library', 'Office', 'Park', 'Pharmacy', 'Post office', 'Shopping mall', 'Swimming pool', 'Veterinary clinic'] },
  { id: 'travel', name: 'Around the world', locations: ['Airport lounge', 'Campsite', 'Desert oasis', 'Ferry', 'Harbor', 'Jungle lodge', 'Mountain cabin', 'Safari park', 'Ski resort', 'Souvenir shop', 'Theme park', 'Tour bus', 'Train station', 'Tropical island', 'Youth hostel'] },
  { id: 'adventure', name: 'Wild adventures', locations: ['Ancient temple', 'Castle', 'Dragon cave', 'Haunted mansion', 'Jungle', 'Lighthouse', 'Moon base', 'Pirate ship', 'Secret laboratory', 'Spaceship', 'Underwater city', 'Volcano', 'Wild West saloon', 'Wizard school', 'Zombie bunker'] },
];
export function locationSetId(locations) {
  return LOCATION_SETS.find(set => set.locations.length === locations.length && set.locations.every((location, i) => location === locations[i]))?.id || 'custom';
}
