/**
 * menu/icons.js — icônes des rayons et catégories (identifiants enregistrés en base)
 * Partagé par la page admin Menu, la borne et l'espace spectateur.
 */
import {
  Coffee, UtensilsCrossed, ShoppingBag, Music, Star,
  Beer, Pizza, IceCream, Wine, Sandwich, Cookie,
  Package, Gift, Shirt, Tag,
} from 'lucide-react'

export const ICONS = [
  { id:'utensils',  label:'Couverts',  Icon:UtensilsCrossed },
  { id:'coffee',    label:'Café',      Icon:Coffee },
  { id:'beer',      label:'Bière',     Icon:Beer },
  { id:'wine',      label:'Vin',       Icon:Wine },
  { id:'pizza',     label:'Pizza',     Icon:Pizza },
  { id:'sandwich',  label:'Sandwich',  Icon:Sandwich },
  { id:'icecream',  label:'Glace',     Icon:IceCream },
  { id:'cookie',    label:'Dessert',   Icon:Cookie },
  { id:'music',     label:'Musique',   Icon:Music },
  { id:'shirt',     label:'Vêtement',  Icon:Shirt },
  { id:'gift',      label:'Cadeau',    Icon:Gift },
  { id:'bag',       label:'Sac',       Icon:ShoppingBag },
  { id:'package',   label:'Colis',     Icon:Package },
  { id:'tag',       label:'Étiquette', Icon:Tag },
  { id:'star',      label:'Spécial',   Icon:Star },
]

export const getIcon = (iconId) => ICONS.find(i => i.id === iconId)?.Icon || Tag
