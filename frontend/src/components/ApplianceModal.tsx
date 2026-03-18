import React, { useState } from 'react';

interface ApplianceModalProps {
  isOpen: boolean;
  slotNumber: number;
  onClose: () => void;
  onAdd: (name: string, type: string) => void;
}

const ApplianceTypes = [
  { label: 'Air Conditioner', key: 'ac', icon: '❄️' },
  { label: 'Refrigerator', key: 'fridge', icon: '🧊' },
  { label: 'Electric Fan', key: 'fan', icon: '🌀' },
  { label: 'Desktop PC', key: 'desktop', icon: '💻' },
  { label: 'Microwave', key: 'microwave', icon: '🍱' },
];

const ApplianceModal: React.FC<ApplianceModalProps> = ({ isOpen, slotNumber, onClose, onAdd }) => {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string>('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedType) return;
    const typeObj = ApplianceTypes.find(t => t.key === selectedType);
    const finalName = customName.trim() !== '' ? customName : (typeObj?.label || 'New Appliance');
    onAdd(finalName, selectedType);
    
    // Reset state for next time
    setSelectedType(null);
    setCustomName('');
  };

  return (
    <div className="overlay open" onClick={(e) => { if ((e.target as Element).className.includes('overlay')) onClose(); }}>
      <div className="modal">
        <div className="modal-drag"></div>
        <div className="modal-slot-tag">⚡ Slot {slotNumber}</div>
        <div className="modal-h">What did you plug in?</div>
        <div className="modal-sub">Pick a type, then give it a name</div>
        
        <div className="type-grid">
          {ApplianceTypes.map((type) => (
            <div 
              key={type.key} 
              className={`type-btn ${selectedType === type.key ? 'sel' : ''}`}
              onClick={() => setSelectedType(type.key)}
            >
              <div className="type-ico" style={{ fontSize: '18px' }}>{type.icon}</div>
              <div className="type-lbl">{type.label}</div>
            </div>
          ))}
        </div>
        
        <div className="modal-field">
          <label>Custom name <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <input 
            type="text" 
            placeholder="e.g. Bedroom AC, Office Fan…" 
            maxLength={32}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
        </div>
        
        <div className="modal-btns">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!selectedType}>
            Add Appliance
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApplianceModal;