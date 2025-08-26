import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#0f766e' },
    secondary: { main: '#1f2937' },
  },
  components: {
    MuiCard: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiButton: { defaultProps: { size: 'small' } },
    MuiTableCell: { styleOverrides: { root: { paddingTop: 6, paddingBottom: 6 } } },
  },
});

export default theme;

