import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <div className="container">
        <div className="hero-section">
          <h1 className="headline">Analysez vos fichiers CCP en 30 secondes</h1>
          <p className="subtitle">
            Importez vos fichiers RESULT CCP et obtenez immédiatement un rapport clair : montant
            encaissé, montant échoué, clients à suivre et liste de blocage.
          </p>

          <button className="cta-button" onClick={() => navigate('/upload')}>
            Commencer l'analyse
          </button>
        </div>

        <div className="features">
          <div className="feature-card">
            <h3>Rapide</h3>
            <p>Analysez plusieurs années de fichiers en moins de 30 secondes.</p>
          </div>
          <div className="feature-card">
            <h3>Complet</h3>
            <p>Obtenez des KPIs détaillés et une analyse du risque par client.</p>
          </div>
          <div className="feature-card">
            <h3>Sécurisé</h3>
            <p>Vos données CCP sont masquées et utilisées uniquement pour votre analyse.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
