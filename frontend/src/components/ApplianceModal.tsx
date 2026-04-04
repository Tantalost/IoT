import React, { useState } from 'react';

interface ApplianceModalProps {
  isOpen: boolean;
  slotNumber: number;
  onClose: () => void;
  onAdd: (name: string, type: string) => void;
  needsReID?: boolean;
  onConfirmSameDevice?: () => void;
  onConfirmNewDevice?: () => void;
  previousDeviceName?: string;
}

const ApplianceTypes = [
  { label: 'Phone Charger', key: 'phone', icon: '📱' },
  { label: 'Laptop Charger', key: 'laptop', icon: '💻' },
  { label: 'Desktop PC', key: 'desktop', icon: '🖥️' },
  { label: 'Television', key: 'tv', icon: '📺' },
  { label: 'Electric Fan', key: 'fan', icon: '🌀' },
  { label: 'Air Conditioner', key: 'ac', icon: '❄️' },
  { label: 'Refrigerator', key: 'fridge', icon: '🧊' },
  { label: 'Microwave', key: 'microwave', icon: '🍱' },
  { label: 'Rice Cooker', key: 'rice', icon: '🍚' },
  { label: 'Coffee Maker', key: 'coffee', icon: '☕' },
  { label: 'Washing Machine', key: 'washer', icon: '🧺' },
  { label: 'Hair Dryer', key: 'hairdryer', icon: '💨' },
  { label: 'Clothes Iron', key: 'iron', icon: '👕' },
  { label: 'LED Light', key: 'light', icon: '💡' },
  { label: 'Generic Device', key: 'default', icon: '🔌' },
];

const ApplianceModal: React.FC<ApplianceModalProps> = ({ isOpen, slotNumber, onClose, onAdd, needsReID, onConfirmSameDevice, onConfirmNewDevice, previousDeviceName }) => {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string>('');

  if (!isOpen) return null;

  // If this is a re-identification prompt, show a different UI
  if (needsReID && onConfirmSameDevice && onConfirmNewDevice && previousDeviceName) {
    return (
      <div className="overlay open" onClick={(e) => { if ((e.target as Element).className.includes('overlay')) onClose(); }}>
        <div className="modal">
          <div className="modal-drag"></div>
          <div className="modal-slot-tag">⚡ Slot {slotNumber}</div>
          <div className="modal-h">New Device Detected?</div>
          <div className="modal-sub">We detected a significant power change. Is this still the same device?</div>
          
          <div style={{ 
            background: 'var(--surface2)', 
            padding: '20px', 
            borderRadius: '12px', 
            marginBottom: '20px',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '8px', 
                background: 'var(--primary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '20px'
              }}>🔌</div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text1)', fontSize: '16px' }}>{previousDeviceName}</div>
                <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Previously configured device</div>
              </div>
            </div>
            <div style={{ 
              fontSize: '13px', 
              color: 'var(--text2)', 
              lineHeight: '1.4',
              background: 'var(--bg)',
              padding: '12px',
              borderRadius: '8px'
            }}>
              ⚠️ Power consumption changed significantly. This might be a different appliance or the same device operating under different conditions.
            </div>
          </div>
          
          <div className="modal-btns">
            <button className="btn btn-ghost" onClick={onConfirmNewDevice}>
              This is a new device
            </button>
            <button className="btn btn-primary" onClick={onConfirmSameDevice}>
              Same device, continue
            </button>
          </div>
        </div>
      </div>
    );
  }

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