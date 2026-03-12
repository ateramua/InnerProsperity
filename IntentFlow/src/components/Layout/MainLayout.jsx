// src/components/Layout/MainLayout.jsx
import Sidebar from '../Navigation/Sidebar';

const MainLayout = ({ children, onNavigate, currentView, accounts }) => {
    return (
        <div style={styles.container}>
            <Sidebar onNavigate={onNavigate} currentView={currentView} />
            <main style={styles.main}>
                {children}
            </main>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        minHeight: '100vh',
        background: '#0f2e1c'
    },
    main: {
        flex: 1,
        marginLeft: '280px',
        padding: '2rem',
        background: '#0f2e1c',
        color: 'white',
        minHeight: '100vh'
    }
};

export default MainLayout;